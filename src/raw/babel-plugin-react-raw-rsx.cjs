function ensureNamedImport(programPath, source, names, t) {
  let importDecl = programPath.node.body.find(
    n => t.isImportDeclaration(n) && n.source.value === source
  );

  if (!importDecl) {
    importDecl = t.importDeclaration([], t.stringLiteral(source));
    programPath.node.body.unshift(importDecl);
  }

  const existing = new Set(
    importDecl.specifiers
      .filter(s => t.isImportSpecifier(s))
      .map(s => s.imported.name)
  );

  for (const name of names) {
    if (!existing.has(name)) {
      importDecl.specifiers.push(
        t.importSpecifier(t.identifier(name), t.identifier(name))
      );
    }
  }
}

// any identifier starting with __ is considered internal
function isInternal(name) {
  return name.startsWith("__");
}

function isInstanceField(name, state) {
  return (
    state &&
    state.rsx &&
    state.rsx.instanceVars &&
    state.rsx.instanceVars.has(name)
  );
}

function referencesProps(node, t) {
  let found = false;

  function walk(n) {
    if (!n || found) return;

    if (t.isIdentifier(n, { name: "props" })) {
      found = true;
      return;
    }

    for (const key in n) {
      const val = n[key];
      if (Array.isArray(val)) val.forEach(walk);
      else if (val && typeof val === "object") walk(val);
    }
  }

  walk(node);
  return found;
}

function recordPropBindings(fnPath, state, t) {
  const params = fnPath.node.params;
  if (!params) return;

  for (const param of params) {
    if (!t.isObjectPattern(param)) continue;

    for (const prop of param.properties) {
      if (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.value)
      ) {
        state.rsx.propBindings.add(prop.value.name);
      }
    }
  }
}


module.exports = function ({ types: t }) {
  let bannedHooks;
  return {
    visitor: {
      Program: {
        enter(path, state) {
          
          bannedHooks = new Set();
          const filename = state.filename || "";

          // Only transform .rsx files
          if (!filename.endsWith(".rsx")) {
            state.skipRSX = true;
            return;
          }

          console.log("[RSX] Transforming", filename);

          // Prepare storage for this file
          state.rsx = {
            instanceVars: new Map(),
            componentPath: null,
            propBindings: new Set(), // 👈 REQUIRED
          };
          ensureNamedImport(path, "react", ["useRef", "useState"], t);
          ensureNamedImport(path, "react-raw", ["bindRender"], t);
        },

        exit(path, state) {
          if (!state.rsx || !state.rsx.componentPath) return;

          const vars = [...state.rsx.instanceVars.entries()];

          // ------------------------------------------------------------
          // Build the per-instance storage object that lives in:
          //   __instanceRef.current
          //
          // This already stores all user "instance vars" (your persistent refs).
          // In Phase 2 we ALSO seed internal RSX runtime slots onto this object.
          // ------------------------------------------------------------
          const initProps = vars.map(([name, init]) =>
            t.objectProperty(
              t.identifier(name),
              init || t.identifier("undefined")
            )
          );

          // ------------------------------------------------------------
          // Phase 2: add internal RSX runtime slots.
          //
          // These live on __instance so they persist per instance, just like user vars.
          // We keep them "compiler-internal" by using __* names.
          //
          // NOTE: we do NOT wire callbacks yet; we only create storage.
          // ------------------------------------------------------------
          initProps.push(
            // init flag to ensure root runs only once per instance
            t.objectProperty(t.identifier("__rsx_initialized"), t.booleanLiteral(false)),

            // props tracking (used later for update(prev, next))
            t.objectProperty(t.identifier("__rsx_prevProps"), t.identifier("undefined")),
            t.objectProperty(t.identifier("__rsx_currentProps"), t.identifier("undefined")),

            // lifecycle callback storage (wired in Phase 3+)
            t.objectProperty(t.identifier("__rsx_updateCb"), t.nullLiteral()),
            t.objectProperty(t.identifier("__rsx_viewCb"), t.nullLiteral()),
            t.objectProperty(t.identifier("__rsx_destroyCb"), t.nullLiteral())
          );

          const initObject = t.objectExpression(initProps);

          const body = state.rsx.componentPath.get("body");

          body.unshiftContainer("body", [
            // __instanceRef declaration
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__instanceRef"),
                t.callExpression(t.identifier("useRef"), [t.nullLiteral()])
              ),
            ]),

            // initialize current instance once
            t.ifStatement(
              t.binaryExpression(
                "===",
                t.memberExpression(
                  t.identifier("__instanceRef"),
                  t.identifier("current")
                ),
                t.nullLiteral()
              ),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(
                      t.identifier("__instanceRef"),
                      t.identifier("current")
                    ),
                    initObject
                  )
                ),
              ])
            ),

            // __instance alias
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__instance"),
                t.memberExpression(
                  t.identifier("__instanceRef"),
                  t.identifier("current")
                )
              ),
            ]),
          ]);
          // Inject bindRender()

          // Create the injected useState call *as a standalone node*
          const injectedUseStateCall = t.callExpression(
            t.identifier("useState"),
            [t.numericLiteral(0)]
          );

          // Tag it so the ban rule can skip it
          injectedUseStateCall.__rsxInjected = true;


          body.unshiftContainer("body", [
            // const [, __rsxForceUpdate] = useState(0);
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.arrayPattern([
                  null, // destructuring hole (IMPORTANT: not t.nullLiteral())
                  t.identifier("__rsxForceUpdate"),
                ]),
                injectedUseStateCall
              ),
            ]),

            // bindRender(() => __rsxForceUpdate(x => x + 1));
            t.expressionStatement(
              t.callExpression(t.identifier("bindRender"), [
                t.arrowFunctionExpression(
                  [],
                  t.callExpression(t.identifier("__rsxForceUpdate"), [
                    t.arrowFunctionExpression(
                      [t.identifier("x")],
                      t.binaryExpression("+", t.identifier("x"), t.numericLiteral(1))
                    ),
                  ])
                ),
              ])
            ),
          ]);


        },
      },

      // Capture the function component
      FunctionDeclaration(path, state) {
        // ------------------------------------------------------------
        // Only operate on the RSX root component.
        // Your plugin identifies it via ExportDefaultDeclaration.
        // ------------------------------------------------------------
        if (!state.rsx || state.skipRSX) return;
        if (path.node !== state.rsx.componentPath?.node) return;

        // We only handle functions with block bodies:
        //   function Foo() { ... }
        // (arrow functions without blocks will be handled later)
        if (!t.isBlockStatement(path.node.body)) return;

        // ------------------------------------------------------------
        // Capture original body (user-written statements).
        // We still keep return statements for now (Phase 1 behavior),
        // even though the new RSX model will later return only null/undefined.
        // ------------------------------------------------------------
        const originalBody = path.node.body.body;

        const nonReturnStatements = [];
        const returnStatements = [];

        for (const stmt of originalBody) {
          if (t.isReturnStatement(stmt)) returnStatements.push(stmt);
          else nonReturnStatements.push(stmt);
        }

        // ------------------------------------------------------------
        // Create an internal initialization flag:
        //
        //   let __rsx_initialized = false;
        //
        // This flag lives inside the component instance and is used
        // to ensure the root code only executes once (init semantics).
        // ------------------------------------------------------------
        const initFlagDecl = t.variableDeclaration("let", [
          t.variableDeclarator(
            t.identifier("__rsx_initialized"),
            t.booleanLiteral(false)
          )
        ]);

        // ------------------------------------------------------------
        // Phase 2: props tracking on every call.
        //
        // Use arguments[0] so this works whether the user writes:
        //   function Player(props) { ... }
        // or:
        //   function Player({score}) { ... }
        //
        // This gives us:
        //   prevProps and currentProps for future update(prev, next).
        // ------------------------------------------------------------
        const trackPropsStatements = [
          // __instance.__rsx_prevProps = __instance.__rsx_currentProps;
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_prevProps")),
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_currentProps"))
            )
          ),

          // __instance.__rsx_currentProps = arguments[0];
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_currentProps")),
              t.memberExpression(t.identifier("arguments"), t.numericLiteral(0), /*computed*/ true)
            )
          )
        ];

        // ------------------------------------------------------------
        // Phase 2: init-once guard stored on __instance.
        //
        // IMPORTANT: this fixes Phase 1's "local let __rsx_initialized"
        // problem by persisting init state on the per-instance object.
        //
        // if (!__instance.__rsx_initialized) {
        //   __instance.__rsx_initialized = true;
        //   ...user init code...
        // }
        // ------------------------------------------------------------
        const initGuard = t.ifStatement(
          t.unaryExpression(
            "!",
            t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_initialized"))
          ),
          t.blockStatement([
            // __instance.__rsx_initialized = true;
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_initialized")),
                t.booleanLiteral(true)
              )
            ),

            // user code that should run only once per instance
            ...nonReturnStatements
          ])
        );

        // ------------------------------------------------------------
        // Replace the body:
        //
        // 1) Always track props each call (for later update wiring)
        // 2) Run root code only once per instance
        // 3) Keep return statements for now (we'll remove/normalize later)
        // ------------------------------------------------------------
        path.node.body.body = [
          ...trackPropsStatements,
          initGuard,
          ...returnStatements
        ];
      },
      ExportDefaultDeclaration(path, state) {
        if (!state.rsx || state.skipRSX) return;

        const decl = path.get("declaration");

        if (
          decl.isFunctionDeclaration() ||
          decl.isFunctionExpression() ||
          decl.isArrowFunctionExpression()
        ) {
          state.rsx.componentPath = decl;
          recordPropBindings(decl, state, t);
        }
      },

      // Capture variables to persist
      VariableDeclarator(path, state) {
        if (!state.rsx || state.skipRSX) return;

        const fn = path.getFunctionParent();
        if (!fn || fn.node !== state.rsx.componentPath.node) return;

        const { id, init } = path.node;
        if (!t.isIdentifier(id)) return;

        // Skip compiler internals
        if (isInternal(id.name)) return;

        // ⚠️ WARNING: instance init derived from props
        if (
          init &&
          (
            referencesProps(init, t) ||
            (
              t.isIdentifier(init) &&
              state.rsx.propBindings?.has(init.name)
            )
          )
        ) {
          console.warn(
            path.buildCodeFrameError(
              `[RSX] Warning: initializing instance state "${id.name}" from props.\n` +
              "Instance initializers run before root code and may capture stale values.\n" +
              "Move this logic into init() or update()."
            ).message
          );
        }

        // ✅ capture instance var (keep this)
        state.rsx.instanceVars.set(id.name, init);

        const decl = path.parentPath;
        if (decl.node.declarations.length === 1) {
          decl.remove();
        } else {
          path.remove();
        }
      },

      AssignmentExpression(path , state) {
        if (!state.rsx || state.skipRSX) return;

        const { left, right } = path.node;

        /**
         * 1. HARD ERROR: mutating props directly
         *
         *   props.foo = ...
         *
         * Props are immutable in RSX and this is never valid.
         */
        if (
          t.isMemberExpression(left) &&
          t.isIdentifier(left.object, { name: "props" })
        ) {
          throw path.buildCodeFrameError(
            "[RSX] Props are immutable.\n" +
            "Do not assign to props.* — treat props as read-only inputs."
          );
        }

        /**
         * From this point on, we only care about assignments to
         * RSX instance variables (persistent component state).
         */
        if (!t.isIdentifier(left)) return;
        if (!isInstanceField(left.name, state)) return;

        /**
         * 2. WARNING: root-scope assignment derived from props
         *
         *   elapsedMs = props.startMs
         *   elapsedMs = startMs   // startMs came from props destructuring
         *
         * This is legal JavaScript but dangerous in RSX because
         * root scope is reactive and instance initialization
         * happens earlier.
         */
        const rhsIsPropDerived =
          referencesProps(right, t) ||
          (
            t.isIdentifier(right) &&
            state.rsx.propBindings?.has(right.name)
          );

        if (rhsIsPropDerived) {
          console.warn(
            path.buildCodeFrameError(
              `[RSX] Warning: assigning instance state "${left.name}" from props in root scope.\n` +
              "Root scope is reactive and may capture stale values.\n" +
              "Move this logic into init() or update()."
            ).message
          );
        }

        /**
         * 3. REWRITE: persist assignment onto the instance
         *
         *   elapsedMs = ...
         *     ↓
         *   __instance.elapsedMs = ...
         */
        path.node.left = t.memberExpression(
          t.identifier("__instance"),
          t.identifier(left.name)
        );
      },
      
      // Rewrite variable references
      Identifier(path, state) {
        if (!state.rsx || state.skipRSX) return;
        if (!path.isReferencedIdentifier()) return;

        if (
      path.parentPath.isAssignmentExpression({ left: path.node })
    ) {
      return;
    }

        const name = path.node.name;

        if (isInternal(name)) return;

        // Do not rewrite compiler internals
        if (name === "__instance") return;

        // Only rewrite captured instance vars
        if (!state.rsx.instanceVars.has(name)) return;

        // Do not rewrite property keys: __instance.foo
        if (
          path.parentPath.isMemberExpression() &&
          path.parentKey === "property"
        ) {
          return;
        }

        path.replaceWith(
          t.memberExpression(
            t.identifier("__instance"),
            t.identifier(name)
          )
        );
      },
      ImportDeclaration(path, state) {
        if (!state.rsx || state.skipRSX) return;
        if (path.node.source.value !== "react") return;

        for (const spec of path.node.specifiers) {
          if (!t.isImportSpecifier(spec)) continue;

          const imported = spec.imported.name;
          const local = spec.local.name;

          // Ban these hooks in RSX
          if (imported === "useState" || 
              imported === "useCallback" ||
              imported === "useMemo") {
            bannedHooks.add(local);
          }
        }
      },
      CallExpression(path, state) {
        if (!state.rsx || state.skipRSX) return;

        
        if (path.node.__rsxInjected) return;

        const callee = path.get("callee");
        if (!callee.isIdentifier()) return;
        if (isInternal(callee.node.name)) return;

        if (bannedHooks.has(callee.node.name)) {
          const name = callee.node.name;

          if (name === "useCallback") {
            throw path.buildCodeFrameError(
              "[RSX] useCallback() is not allowed in .rsx files.\n" +
              "RSX guarantees stable function identity by default.\n" +
              "Define functions normally and call render() when updates are needed."
            );
          }

          if (name === "useState") {
            throw path.buildCodeFrameError(
              "[RSX] useState() is not allowed in .rsx files.\n" +
              "Use RSX local variables for instance state, or external hooks for shared state."
            );
          }

          if (name === "useMemo") {
            throw path.buildCodeFrameError(
              "[RSX] useMemo() is not allowed in .rsx files.\n" +
              "RSX code does not re-run on every render.\n" +
              "Move expensive work to explicit update logic or manual memoization."
            );
          }
        }
      },
    },
  };
};
