function ensureNamedImport(programPath, source, names, t) {
  let importDecl = programPath.node.body.find(
    (n) => t.isImportDeclaration(n) && n.source.value === source
  );

  if (!importDecl) {
    importDecl = t.importDeclaration([], t.stringLiteral(source));
    programPath.node.body.unshift(importDecl);
  }

  const existing = new Set(
    importDecl.specifiers
      .filter((s) => t.isImportSpecifier(s))
      .map((s) => (t.isIdentifier(s.imported) ? s.imported.name : s.imported.value))
  );

  for (const name of names) {
    if (!existing.has(name)) {
      importDecl.specifiers.push(t.importSpecifier(t.identifier(name), t.identifier(name)));
    }
  }
}

// any identifier starting with __ is considered internal
function isInternal(name) {
  return name.startsWith("__");
}

function isInstanceField(name, state) {
  return state && state.rsx && state.rsx.instanceVars && state.rsx.instanceVars.has(name);
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

module.exports = function ({ types: t }) {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          state.bannedHooks = new Set();
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
          };
          //ensureNamedImport(path, "react-raw", ["bindRender"], t);
          ensureNamedImport(path, "react", ["useRef", "useState", "useEffect"], t);
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
            t.objectProperty(t.identifier(name), init || t.identifier("undefined"))
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
            t.objectProperty(t.identifier("__rsx_destroyCb"), t.nullLiteral()),
            t.objectProperty(t.identifier("__rsx_viewResult"), t.nullLiteral())
            //t.objectProperty(t.identifier("__rsx_triggerRender"),t.nullLiteral())
          );

          const initObject = t.objectExpression(initProps);

          const body = state.rsx.componentPath.get("body");

          // Create the injected useState call *as a standalone node*
          const injectedUseStateCall = t.callExpression(t.identifier("useState"), [
            t.numericLiteral(0),
          ]);

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
                t.memberExpression(t.identifier("__instanceRef"), t.identifier("current")),
                t.nullLiteral()
              ),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(t.identifier("__instanceRef"), t.identifier("current")),
                    initObject
                  )
                ),
              ])
            ),

            // __instance alias
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__instance"),
                t.memberExpression(t.identifier("__instanceRef"), t.identifier("current"))
              ),
            ]),

            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("__rsx_triggerRender"),
                t.arrowFunctionExpression(
                  [],
                  t.callExpression(t.identifier("__rsxForceUpdate"), [
                    t.arrowFunctionExpression(
                      [t.identifier("x")],
                      t.binaryExpression("+", t.identifier("x"), t.numericLiteral(1))
                    ),
                  ])
                )
              ),
            ]),
          ]);

          // Add useEffect for cleanup/destroy callback
          body.unshiftContainer("body", [
            t.expressionStatement(
              t.callExpression(t.identifier("useEffect"), [
                t.arrowFunctionExpression(
                  [],
                  t.blockStatement([
                    t.returnStatement(
                      t.arrowFunctionExpression(
                        [],
                        t.blockStatement([
                          t.ifStatement(
                            t.memberExpression(
                              t.identifier("__instance"),
                              t.identifier("__rsx_destroyCb")
                            ),
                            t.blockStatement([
                              t.expressionStatement(
                                t.callExpression(
                                  t.memberExpression(
                                    t.identifier("__instance"),
                                    t.identifier("__rsx_destroyCb")
                                  ),
                                  []
                                )
                              ),
                            ])
                          ),
                        ])
                      )
                    ),
                  ])
                ),
                t.arrayExpression([]),
              ])
            ),
          ]);
        },
      },
      FunctionDeclaration(path, state) {
        // ------------------------------------------------------------
        // Only operate on the RSX root component.
        // Your plugin identifies it via ExportDefaultDeclaration.
        // ------------------------------------------------------------
        if (!state.rsx || state.skipRSX) return;
        if (path.node !== state.rsx.componentPath?.node) return;
        if (!t.isBlockStatement(path.node.body)) return;

        // ------------------------------------------------------------
        // Keep original function signature for React compatibility
        // The outer function still receives props from React
        // Transform params to match React component signature: (props, ref?)
        // ------------------------------------------------------------
        const hasSecondParam = path.node.params.length > 1;

        // Replace user's params with standard React params
        path.node.params = [t.identifier("__reactProps")];
        if (hasSecondParam) {
          path.node.params.push(t.identifier("ref"));
        }

        // ------------------------------------------------------------
        // Split original user body into return vs non-return
        // ------------------------------------------------------------
        const originalBody = path.node.body.body;

        const nonReturnStatements = [];
        const returnStatements = [];

        for (const stmt of originalBody) {
          if (t.isReturnStatement(stmt)) returnStatements.push(stmt);
          else nonReturnStatements.push(stmt);
        }

        // ------------------------------------------------------------
        // Phase 2: props tracking on every call.
        //
        // Extract props from React (__reactProps) and track changes
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

          // __instance.__rsx_currentProps = __reactProps;
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_currentProps")),
              t.identifier("__reactProps")
            )
          ),
        ];

        // ------------------------------------------------------------
        // CREATE LIFECYCLE CONTEXT OBJECT
        // This object is passed to the user function and provides
        // stable references to lifecycle methods.
        // ------------------------------------------------------------
        const ctxObjectDecl = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.identifier("__rsx_ctx"),
            t.objectExpression([
              // view(fn) { __instance.__rsx_viewCb = fn; }
              t.objectMethod(
                "method",
                t.identifier("view"),
                [t.identifier("fn")],
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_viewCb")),
                      t.identifier("fn")
                    )
                  ),
                ])
              ),
              // update(fn) { __instance.__rsx_updateCb = fn; }
              t.objectMethod(
                "method",
                t.identifier("update"),
                [t.identifier("fn")],
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      t.memberExpression(
                        t.identifier("__instance"),
                        t.identifier("__rsx_updateCb")
                      ),
                      t.identifier("fn")
                    )
                  ),
                ])
              ),
              // destroy(fn) { __instance.__rsx_destroyCb = fn; }
              t.objectMethod(
                "method",
                t.identifier("destroy"),
                [t.identifier("fn")],
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      t.memberExpression(
                        t.identifier("__instance"),
                        t.identifier("__rsx_destroyCb")
                      ),
                      t.identifier("fn")
                    )
                  ),
                ])
              ),
              // render() {  __rsx_render(); __rsx_triggerRender(); }
              t.objectMethod(
                "method",
                t.identifier("render"),
                [],
                t.blockStatement([
                  t.expressionStatement(t.callExpression(t.identifier("__rsx_render"), [])),
                  t.expressionStatement(t.callExpression(t.identifier("__rsx_triggerRender"), [])),
                ])
              ),

              // get props() { return __instance.__rsx_currentProps; }
              t.objectMethod(
                "get",
                t.identifier("props"),
                [],
                t.blockStatement([
                  t.returnStatement(
                    t.memberExpression(
                      t.identifier("__instance"),
                      t.identifier("__rsx_currentProps")
                    )
                  ),
                ])
              ),
            ])
          ),
        ]);

        // ------------------------------------------------------------
        // __rsx_render internal function (called by render())
        // ------------------------------------------------------------
        const renderFnDecl = t.functionDeclaration(
          t.identifier("__rsx_render"),
          [],
          t.blockStatement([
            t.ifStatement(
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_viewCb")),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(
                      t.identifier("__instance"),
                      t.identifier("__rsx_viewResult")
                    ),
                    t.callExpression(
                      t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_viewCb")),
                      [
                        t.memberExpression(
                          t.identifier("__instance"),
                          t.identifier("__rsx_currentProps")
                        ),
                      ]
                    )
                  )
                ),
              ])
            ),
          ])
        );

        // ------------------------------------------------------------
        // Phase 2: init-once guard (true constructor semantics)
        // User code receives context via parameters, not scope injection
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

            // --------------------------------------------------------
            // Call user function with context object
            // --------------------------------------------------------
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(t.identifier("__userInit"), t.identifier("call")),
                [t.thisExpression(), t.identifier("__rsx_ctx")]
              )
            ),

            // NEW: render once on mount so view() output is produced immediately
            t.expressionStatement(t.callExpression(t.identifier("__rsx_render"), [])),
          ])
        );

        // ------------------------------------------------------------
        // Wrap user code in a function to call with context
        // ------------------------------------------------------------
        const userInitFn = t.functionDeclaration(
          t.identifier("__userInit"),
          [
            t.objectPattern([
              t.objectProperty(t.identifier("view"), t.identifier("view"), false, true),
              t.objectProperty(t.identifier("update"), t.identifier("update"), false, true),
              t.objectProperty(t.identifier("destroy"), t.identifier("destroy"), false, true),
              t.objectProperty(t.identifier("render"), t.identifier("render"), false, true),
              t.objectProperty(t.identifier("props"), t.identifier("props"), false, true),
            ]),
          ],
          t.blockStatement(nonReturnStatements)
        );

        // ------------------------------------------------------------
        // Update + render execution (Phase 4)
        //
        // Runs on every call AFTER init
        // ------------------------------------------------------------
        const updateAndRender = t.ifStatement(
          //
          t.logicalExpression(
            "&&",
            t.logicalExpression(
              "&&",
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_initialized")),
              t.binaryExpression(
                "!==",
                t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_prevProps")),
                t.identifier("undefined")
              )
            ),
            t.binaryExpression(
              "!==",
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_prevProps")),
              t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_currentProps"))
            )
          ),
          //
          t.blockStatement([
            // call update(prev, current)
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_updateCb")),
                [
                  t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_prevProps")),
                  t.memberExpression(
                    t.identifier("__instance"),
                    t.identifier("__rsx_currentProps")
                  ),
                ]
              )
            ),

            // auto render after update
            t.expressionStatement(t.callExpression(t.identifier("__rsx_render"), [])),
          ])
        );
        // ------------------------------------------------------------
        // Replace the function body
        // ------------------------------------------------------------
        const finalReturn = t.returnStatement(
          t.logicalExpression(
            "??",
            t.memberExpression(t.identifier("__instance"), t.identifier("__rsx_viewResult")),
            t.nullLiteral()
          )
        );

        path.node.body.body = [
          ...trackPropsStatements,

          ctxObjectDecl,
          renderFnDecl,
          userInitFn,

          initGuard,
          updateAndRender,

          // NEW: RSX-owned return (discard user returns)
          finalReturn,
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
          // No longer need to record prop bindings since props is explicit
        }
      },

      // Capture variables to persist
      VariableDeclarator(path, state) {
        if (!state.rsx || state.skipRSX) return;

        const fn = path.getFunctionParent();
        if (!fn || !state.rsx.componentPath || fn.node !== state.rsx.componentPath.node) return;

        const { id, init } = path.node;
        if (!t.isIdentifier(id)) return;

        // Skip compiler internals
        if (isInternal(id.name)) return;

        // capture instance var (keep this)
        state.rsx.instanceVars.set(id.name, init);

        const decl = path.parentPath;
        if (decl.node.declarations.length === 1) {
          decl.remove();
        } else {
          path.remove();
        }
      },

      AssignmentExpression(path, state) {
        if (!state.rsx || state.skipRSX) return;

        const { left, right } = path.node;

        /**
         * 1. HARD ERROR: mutating props directly
         *
         *   props.foo = ...
         *
         * Props are immutable in RSX and this is never valid.
         */
        if (t.isMemberExpression(left) && t.isIdentifier(left.object, { name: "props" })) {
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
        const rhsIsPropDerived = referencesProps(right, t);

        if (rhsIsPropDerived) {
          const loc = path.node.loc?.start;
          console.warn(
            `[RSX] Warning: assigning instance state "${left.name}" from props in root scope.\n` +
              "Root scope is reactive and may capture stale values.\n" +
              "Move this logic into init() or update()." +
              (loc ? `\n  at ${state.filename}:${loc.line}:${loc.column}` : "")
          );
        }

        /**
         * 3. REWRITE: persist assignment onto the instance
         *
         *   elapsedMs = ...
         *     ↓
         *   __instance.elapsedMs = ...
         */
        path.node.left = t.memberExpression(t.identifier("__instance"), t.identifier(left.name));
      },

      // Rewrite variable references
      Identifier(path, state) {
        if (!state.rsx || state.skipRSX) return;
        if (!path.isReferencedIdentifier()) return;

        if (path.parentPath.isAssignmentExpression({ left: path.node })) {
          return;
        }

        const name = path.node.name;

        if (isInternal(name)) return;

        // Do not rewrite compiler internals
        if (name === "__instance") return;

        // Do not rewrite lifecycle function names - they are parameters now
        if (
          name === "view" ||
          name === "update" ||
          name === "destroy" ||
          name === "render" ||
          name === "props"
        ) {
          return;
        }

        // Only rewrite captured instance vars
        if (!state.rsx.instanceVars.has(name)) return;

        // Do not rewrite property keys: __instance.foo
        if (path.parentPath.isMemberExpression() && path.parentKey === "property") {
          return;
        }

        path.replaceWith(t.memberExpression(t.identifier("__instance"), t.identifier(name)));
      },
      ImportDeclaration(path, state) {
        if (!state.rsx || state.skipRSX) return;
        if (path.node.source.value !== "react") return;

        const BANNED_HOOKS = new Set([
          "useState",
          "useCallback",
          "useMemo",
          // "useContext",
          // "useEffect",
          // "useLayoutEffect",
          // "useReducer",
          // "useRef",
          // "useImperativeHandle",
          // "useInsertionEffect",
          // "useDeferredValue",
          // "useTransition",
          // "useSyncExternalStore",
        ]);

        for (const spec of path.node.specifiers) {
          if (!t.isImportSpecifier(spec)) continue;

          const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
          const local = spec.local.name;

          if (BANNED_HOOKS.has(imported)) {
            state.bannedHooks.add(local);
          }
        }
      },
      CallExpression(path, state) {
        if (!state.rsx || state.skipRSX) return;

        if (path.node.__rsxInjected) return;

        const callee = path.get("callee");
        if (!callee.isIdentifier()) return;
        if (isInternal(callee.node.name)) return;

        // FIX: Use state.bannedHooks with null check
        if (state.bannedHooks && state.bannedHooks.has(callee.node.name)) {
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

          // FIX: Generic error for any other banned hook
          throw path.buildCodeFrameError(
            `[RSX] ${name}() is not allowed in .rsx files.\n` +
              "RSX components do not support React hooks.\n" +
              "Use RSX lifecycle methods (view, update, destroy, render) instead."
          );
        }
      },
    },
  };
};
