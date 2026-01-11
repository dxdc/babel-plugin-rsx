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
          };
          ensureNamedImport(path, "react", ["useRef", "useState"], t);
          ensureNamedImport(path, "react-raw", ["bindRender"], t);
        },

        exit(path, state) {
          if (!state.rsx || !state.rsx.componentPath) return;

          const vars = [...state.rsx.instanceVars.entries()];

          const initObject = t.objectExpression(
            vars.map(([name, init]) =>
              t.objectProperty(
                t.identifier(name),
                init || t.identifier("undefined")
              )
            )
          );

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
        if (!state.rsx || state.skipRSX) return;

        const parent = path.parentPath;
        if (
          parent.isProgram() ||
          parent.isExportDefaultDeclaration()
        ) {
          state.rsx.componentPath = path;
        }
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
        }
      },

      // Capture variables to persist
      VariableDeclarator(path, state) {
        if (!state.rsx || state.skipRSX) return;
        const fn = path.getFunctionParent();
        if (!fn || fn.node !== state.rsx.componentPath.node) return;

        const id = path.node.id;
        if (!t.isIdentifier(id)) return;

        // Skip compiler internals
        if (isInternal(id.name)) return;

        state.rsx.instanceVars.set(id.name, path.node.init);

        const decl = path.parentPath;
        if (decl.node.declarations.length === 1) {
          decl.remove();
        } else {
          path.remove();
        }

      },

      AssignmentExpression(path, state) {
        if (!state.rsx || state.skipRSX) return;

        const left = path.node.left;

        if (
          t.isMemberExpression(left) &&
          t.isIdentifier(left.object, { name: "props" })
        ) {
          throw path.buildCodeFrameError(
            "[RSX] Props are immutable.\n" +
            "Do not assign to props.* — treat props as read-only inputs."
          );
        }

        if (
          t.isIdentifier(left) &&
          isInstanceField(left.name, state)
        ) {
          path.node.left = t.memberExpression(
            t.identifier("__instance"),
            t.identifier(left.name)
          );
        }
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
