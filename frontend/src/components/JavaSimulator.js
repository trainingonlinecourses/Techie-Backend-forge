/**
 * JavaSimulator — lightweight browser-based Java code evaluator.
 * 
 * Handles: System.out.println/print, variables, for loops, if/else,
 * arrays, String methods, Math.*, basic arithmetic, comparison operators.
 */

export function simulateJava(code) {
  if (!code || !code.trim()) {
    return { output: '', errors: ['No code to execute.'] };
  }

  const errors = [];

  // Strip comments
  let src = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Find main method body
  const mainMatch = /public\s+static\s+void\s+main\s*\([^)]*\)\s*\{([\s\S]*)\}/.exec(src);
  function flushResult(result) {
    if (result._pending && result._pending.length > 0) {
      result.output.push(result._pending);
    }
    return { output: result.output.join('\n'), errors: result.errors };
  }

  if (mainMatch) {
    return flushResult(runBlock(mainMatch[1], errors));
  }

  // No main — try class body
  const classBodyMatch = /class\s+\w+[^{]*\{([\s\S]*)\}\s*$/.exec(src);
  if (classBodyMatch) {
    return flushResult(runBlock(classBodyMatch[1], errors));
  }

  return flushResult(runBlock(src, errors));
}

/**
 * Run a block of code. Each call gets its own vars/arrays scope.
 */
function runBlock(code, errors, parentVars, parentArrays) {
  const output = [];
  output._pending = '';
  const vars = parentVars ? Object.create(parentVars) : {};
  const arrays = parentArrays ? Object.create(parentArrays) : {};

  const stmts = splitStatements(code);
  let i = 0;

  while (i < stmts.length) {
    const stmt = stmts[i].trim();
    if (!stmt || stmt === '{' || stmt === '}') { i++; continue; }

    // Skip class/method declarations
    if (stmt.startsWith('public') && !stmt.includes('public static void main')) {
      if (stmt.includes('{')) {
        let depth = 1;
        i++;
        while (i < stmts.length && depth > 0) {
          if (stmts[i] === '{') depth++;
          if (stmts[i] === '}') depth--;
          i++;
        }
      } else {
        i++;
      }
      continue;
    }

    // --- Variable declaration (primitives, String, collections, generic types) ---
    const declMatch = /^(int|long|double|float|boolean|char|byte|short|String|var|Integer|Long|Double|Float|Boolean|Character|Object|ArrayList<[^>]+>|HashMap<[^>]+>|HashSet<[^>]+>|LinkedList<[^>]+>|List<[^>]+>|Map<[^>]+>|Set<[^>]+>|Collection<[^>]+>|Optional<[^>]+>|\w+(?:<[^>]+>)?)\s+(\w+)\s*=\s*(.+);?$/.exec(stmt);
    if (declMatch) {
      const [, type, name, expr] = declMatch;
      const val = evaluateExpr(expr.replace(/;$/, ''), vars, arrays);
      vars[name] = { type, value: val };
      i++; continue;
    }

    // --- Array declaration & init ---
    const arrDeclMatch = /^(int|long|double|float|String|char|boolean)\[\]\s+(\w+)\s*=\s*\{([^}]+)\};?$/.exec(stmt);
    if (arrDeclMatch) {
      const [, type, name, vals] = arrDeclMatch;
      const values = vals.split(',').map(v => parseLiteral(v.trim()));
      arrays[name] = { type, values };
      vars[name] = { type: type + '[]', value: values };
      i++; continue;
    }

    // --- for loop (counted) ---
    const forMatch = /^for\s*\(\s*(int|var)\s+(\w+)\s*=\s*(-?\d+)\s*;\s*(\w+)\s*([<>=!]+)\s*(.+?)\s*;\s*\w+\s*(\+\+|--|\s*\+=\s*\d+|\s*-=\s*\d+)\s*\)\s*\{?$/.exec(stmt);
    if (forMatch) {
      const [, , varName, startStr, condVar, op, endExpr, stepStr] = forMatch;
      let current = parseInt(startStr);
      const end = evaluateExpr(endExpr, vars, arrays);
      const step = stepStr.includes('++') ? 1 : stepStr.includes('--') ? -1 : parseInt(stepStr.replace(/[+\-= ]/g, ''));

      // Skip opening '{'
      i++;
      if (i < stmts.length && stmts[i].trim() === '{') i++;

      // Collect body including nested braces
      const body = [];
      let depth = 1;
      while (i < stmts.length && depth > 0) {
        const bs = stmts[i].trim();
        if (bs === '{') { depth++; body.push(bs); i++; continue; }
        if (bs === '}') { depth--; if (depth === 0) { i++; break; } body.push(bs); i++; continue; }
        body.push(bs);
        i++;
      }

      // Execute loop — rebuild body as string and re-parse each iteration
      const bodyCode = body.join('; ');
      const maxIter = 10000;
      let iter = 0;
      while (iter < maxIter) {
        let condMet = false;
        switch (op) {
          case '<': condMet = current < end; break;
          case '<=': condMet = current <= end; break;
          case '>': condMet = current > end; break;
          case '>=': condMet = current >= end; break;
          case '!=': condMet = current !== end; break;
          case '==': condMet = current === end; break;
          default: condMet = false;
        }
        if (!condMet) break;

        vars[varName] = { type: 'int', value: current };
        // Re-parse body each iteration so nested loops work
        const innerResult = runBlock(bodyCode, errors, vars, arrays);
        // Merge: prepend our pending to first output line, then push rest
        if (innerResult.output.length > 0) {
          output.push(output._pending + innerResult.output[0]);
          output._pending = '';
          output.push(...innerResult.output.slice(1));
        }
        // Carry pending across iterations
        if (innerResult._pending) output._pending += innerResult._pending;

        current += step;
        iter++;
      }
      continue;
    }

    // --- for-each loop ---
    const enhForMatch = /^for\s*\(\s*(?:int|long|double|float|String|char|boolean|var|Map\.Entry<[^>]+>|Object)\s+(\w+)\s*:\s*(.+?)\s*\)\s*\{?$/.exec(stmt);
    if (enhForMatch) {
      const [, varName, collExpr] = enhForMatch;
      // Evaluate collection expression — handles both simple vars and method calls like scores.entrySet()
      const collResult = evaluateExpr(collExpr, vars, arrays);
      let values = [];
      let isMapIteration = false;
      let mapData = null;

      if (collResult && collResult._type === 'ArrayList') {
        values = collResult._data;
      } else if (collResult && collResult._type === 'HashMap') {
        isMapIteration = true;
        mapData = collResult._data;
        values = Object.keys(collResult._data);
      } else if (collResult && collResult._type === 'HashSet') {
        values = collResult._data;
      } else if (collResult && collResult._type === 'ArrayList') {
        values = collResult._data;
      } else {
        // Fallback: look up as variable
        const coll = vars[collExpr] || arrays[collExpr];
        if (coll && coll.value) {
          if (coll.value._type === 'ArrayList') { values = coll.value._data; }
          else if (coll.value._type === 'HashMap') { isMapIteration = true; mapData = coll.value._data; values = Object.keys(coll.value._data); }
          else if (coll.value._type === 'HashSet') { values = coll.value._data; }
          else if (Array.isArray(coll.value)) { values = coll.value; }
        } else if (coll && Array.isArray(coll.values)) { values = coll.values; }
      }

      i++;
      if (i < stmts.length && stmts[i].trim() === '{') i++;

      const body = [];
      let depth = 1;
      while (i < stmts.length && depth > 0) {
        const bs = stmts[i].trim();
        if (bs === '{') { depth++; body.push(bs); i++; continue; }
        if (bs === '}') { depth--; if (depth === 0) { i++; break; } body.push(bs); i++; continue; }
        body.push(bs);
        i++;
      }

      const bodyCode = body.join('; ');
      for (const val of values) {
        if (isMapIteration) {
          const isEntryIteration = stmt.includes('Map.Entry');
          if (isEntryIteration) {
            vars[varName] = { type: 'MapEntry', value: { _type: 'MapEntry', key: val, value: mapData ? mapData[val] : val } };
          } else {
            vars[varName] = { type: 'var', value: val };
          }
        } else {
          vars[varName] = { type: 'var', value: val };
        }
        const innerResult = runBlock(bodyCode, errors, vars, arrays);
        // Merge: prepend our pending to first output line, then push rest
        if (innerResult.output.length > 0) {
          output.push(output._pending + innerResult.output[0]);
          output._pending = '';
          output.push(...innerResult.output.slice(1));
        }
        // Carry pending across iterations
        if (innerResult._pending) output._pending += innerResult._pending;
      }
      continue;
    }

    // --- try / catch / finally ---
    const tryMatch = /^try\s*\{?$/.exec(stmt);
    if (tryMatch) {
      i = executeTryCatch(i, stmts, vars, arrays, output, errors);
      continue;
    }

    // --- throw statement ---
    const throwMatch = /^throw\s+(?:new\s+)?(.+);?$/.exec(stmt);
    if (throwMatch) {
      const excMsg = throwMatch[1].trim();
      // Try to evaluate as expression first (e.g., new Exception("msg"))
      const excVal = evaluateExpr(excMsg, vars, arrays);
      if (typeof excVal === 'string') {
        errors.push(excVal);
      } else if (excVal && excVal._message) {
        errors.push(excVal._class + ': ' + excVal._message);
      } else {
        errors.push(String(excVal));
      }
      i++; continue;
    }

    // --- if / else if / else ---
    const ifMatch = /^if\s*\((.+)\)\s*\{?$/.exec(stmt);
    if (ifMatch) {
      i = executeIfElse(i, stmts, ifMatch[1].replace(/\)\s*\{?$/, ''), vars, arrays, output, errors);
      continue;
    }

    // --- Regular statement ---
    executeStatement(stmt, vars, arrays, output, errors);
    i++;
  }

  // Don't flush pending here — let the caller merge across iterations
  return { output, errors, _pending: output._pending };
}

function collectBody(stmts, startIndex) {
  const body = [];
  let i = startIndex;
  if (i < stmts.length && stmts[i].trim() === '{') i++;
  let depth = 1;
  while (i < stmts.length && depth > 0) {
    const bs = stmts[i].trim();
    if (bs === '{') { depth++; body.push(bs); i++; continue; }
    if (bs === '}') { depth--; if (depth === 0) { i++; break; } body.push(bs); i++; continue; }
    body.push(bs);
    i++;
  }
  return { body, nextIndex: i };
}

function executeIfElse(i, stmts, condExpr, vars, arrays, output, errors) {
  const cond = evaluateExpr(condExpr, vars, arrays);

  const { body, nextIndex } = collectBody(stmts, i + 1);
  i = nextIndex;

  const elseIfBlocks = [];
  let elseBody = null;

  while (i < stmts.length) {
    const next = stmts[i].trim();

    const eiMatch = /^else\s+if\s*\((.+)\)\s*\{?$/.exec(next);
    if (eiMatch) {
      const eiCond = evaluateExpr(eiMatch[1].replace(/\)\s*\{?$/, ''), vars, arrays);
      const result = collectBody(stmts, i + 1);
      elseIfBlocks.push({ cond: eiCond, body: result.body });
      i = result.nextIndex;
      continue;
    }

    const elseMatch = /^else\s*\{?$/.exec(next);
    if (elseMatch) {
      const result = collectBody(stmts, i + 1);
      elseBody = result.body;
      i = result.nextIndex;
    }
    break;
  }

  function runBody(bodyStmts) {
    const code = bodyStmts.join('; ');
    const result = runBlock(code, errors, vars, arrays);
    if (output._pending.length > 0 && result.output.length > 0) {
      output._pending += result.output[0];
      output.push(...result.output.slice(1));
    } else {
      output.push(...result.output);
    }
    output._pending += (result.output._pending || '');
  }

  if (isTruthy(cond)) {
    runBody(body);
  } else {
    let executed = false;
    for (const { cond: eiCond, body: eiBody } of elseIfBlocks) {
      if (isTruthy(eiCond)) {
        runBody(eiBody);
        executed = true;
        break;
      }
    }
    if (!executed && elseBody) {
      runBody(elseBody);
    }
  }

  return i;
}

function executeTryCatch(i, stmts, vars, arrays, output, errors) {
  // Collect try body
  const { body: tryBody, nextIndex: afterTry } = collectBody(stmts, i + 1);
  i = afterTry;

  let catchBlocks = [];
  let finallyBody = null;

  while (i < stmts.length) {
    const next = stmts[i].trim();

    // catch (ExceptionType e) {
    const catchMatch = /^catch\s*\((\w+)\s+(\w+)\)\s*\{?$/.exec(next);
    if (catchMatch) {
      const [, excType, excVar] = catchMatch;
      const result = collectBody(stmts, i + 1);
      catchBlocks.push({ excType, excVar, body: result.body });
      i = result.nextIndex;
      continue;
    }

    // finally {
    const finallyMatch = /^finally\s*\{?$/.exec(next);
    if (finallyMatch) {
      const result = collectBody(stmts, i + 1);
      finallyBody = result.body;
      i = result.nextIndex;
      continue;
    }

    break;
  }

  function runCode(bodyStmts) {
    const code = bodyStmts.join('; ');
    const result = runBlock(code, errors, vars, arrays);
    output.push(...result.output);
    return result.errors;
  }

  let thrownException = null;
  let throwMsg = '';
  try {
    const tryErrors = [];
    const tryResult = runBlock(tryBody.join('; '), tryErrors, vars, arrays);
    output.push(...tryResult.output);
    if (tryResult.errors.length > 0) {
      thrownException = tryResult.errors[tryResult.errors.length - 1];
      throwMsg = thrownException;
    }
    // Check for explicit throw statements that produced errors
    if (tryErrors.length > 0) {
      thrownException = tryErrors[tryErrors.length - 1];
      throwMsg = thrownException;
    }
  } catch (e) {
    thrownException = e.message || String(e);
    throwMsg = thrownException;
  }

  if (thrownException && catchBlocks.length > 0) {
    let caught = false;
    for (const { excType, excVar, body } of catchBlocks) {
      // Always catch generic types, or match specific type
      const excMsg = String(thrownException);
      if (excType === 'Exception' || excType === 'Throwable' || excType === 'RuntimeException' ||
          excMsg.includes(excType) || excType === 'NullPointerException' ||
          excType === 'ArrayIndexOutOfBoundsException' ||
          excType === 'ArithmeticException' || excType === 'ClassCastException' ||
          excType === 'NumberFormatException' || excType === 'IOException') {
        // Create an exception object with toString()
        vars[excVar] = {
          type: excType,
          value: { _type: 'Exception', _class: excType, _message: excMsg, toString: function() { return this._class + ': ' + this._message; } }
        };
        const catchErrors = [];
        const catchResult = runBlock(body.join('; '), catchErrors, vars, arrays);
        output.push(...catchResult.output);
        errors.push(...catchErrors);
        caught = true;
        break;
      }
    }
    if (!caught && catchBlocks.length > 0) {
      errors.push(thrownException);
    }
  }

  if (finallyBody) {
    const finallyErrors = [];
    const finallyResult = runBlock(finallyBody.join('; '), finallyErrors, vars, arrays);
    output.push(...finallyResult.output);
  }

  return i;
}

function executeStatement(stmt, vars, arrays, output, errors) {
  if (!stmt || stmt === '{' || stmt === '}' || stmt === '') return;  // System.out.println(...)
    const printMatch = /^(System\.out\.print(?:ln)?)\((.+)\);?$/.exec(stmt);
    if (printMatch) {
      const isLn = printMatch[1].endsWith('ln');
      const val = evaluateExpr(printMatch[2].trim(), vars, arrays);
      if (val && val.error) {
        errors.push(val.error);
      } else {
        const text = String(val ?? '');
        if (isLn) {
          output.push(output._pending + text);
          output._pending = '';
        } else {
          output._pending += text;
        }
      }
      return;
    }

  // System.out.println() — no args
  if (/^System\.out\.print(?:ln)?\(\);?$/.test(stmt)) {
    output.push('');
    return;
  }

  // Variable reassignment
  const reassignMatch = /^(\w+)\s*=\s*(.+);?$/.exec(stmt);
  if (reassignMatch) {
    const [, name, expr] = reassignMatch;
    if (vars[name]) {
      vars[name].value = evaluateExpr(expr.replace(/;$/, ''), vars, arrays);
    } else if (arrays[name]) {
      arrays[name].values = evaluateExpr(expr.replace(/;$/, ''), vars, arrays);
    }
    return;
  }

  // Array element: arr[i] = val;
  const arrElemMatch = /^(\w+)\[(.+)\]\s*=\s*(.+);?$/.exec(stmt);
  if (arrElemMatch) {
    const [, arrName, idxExpr, valExpr] = arrElemMatch;
    if (arrays[arrName]) {
      const idx = evaluateExpr(idxExpr, vars, arrays);
      const val = evaluateExpr(valExpr, vars, arrays);
      arrays[arrName].values[idx] = val;
    }
    return;
  }

  // Any other statement
  evaluateExpr(stmt.replace(/;$/, ''), vars, arrays);
}

function splitStatements(code) {
  const stmts = [];
  let current = '';
  let inString = false;
  let parenDepth = 0;
  let curlyDepth = 0; // tracks {} depth within the current statement

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    if (ch === '"') { inString = !inString; current += ch; continue; }

    if (!inString) {
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth--;

      if (parenDepth === 0) {
        if (ch === '{') {
          if (curlyDepth === 0) {
            // Block-level { — only if it follows ) or is standalone
            const trimmed = current.trim();
            if (!trimmed || trimmed.endsWith(')') || trimmed.endsWith('else') || trimmed.endsWith('do') || trimmed === 'finally' || trimmed === 'try') {
              if (trimmed) stmts.push(trimmed);
              current = '';
              stmts.push(ch);
              continue;
            }
          }
          curlyDepth++;
        }
        if (ch === '}') {
          if (curlyDepth > 0) {
            curlyDepth--;
          } else {
            // Block-level }
            if (current.trim()) stmts.push(current.trim());
            current = '';
            stmts.push(ch);
            continue;
          }
        }
        if (ch === ';' && curlyDepth === 0) {
          stmts.push(current.trim());
          current = '';
          continue;
        }
      }
    }

    current += ch;
  }

  if (current.trim()) stmts.push(current.trim());
  return stmts;
}

// ==================== EXPRESSION EVALUATOR ====================

function evaluateExpr(expr, vars, arrays) {
  expr = expr.trim().replace(/;$/, '');
  if (!expr) return '';

  // String literal — must be a SINGLE quoted string with no top-level operators
  if (expr.startsWith('"') && expr.endsWith('"') && !expr.includes('" + "') && !expr.includes('" +') && !expr.includes('+ "')) return expr.slice(1, -1);

  // Char literal
  if (expr.startsWith("'") && expr.endsWith("'")) return expr.slice(1, -1);

  // Boolean/null literals
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;

  // Numeric literals
  if (/^-?\d+L?$/.test(expr)) return parseInt(expr.replace(/L$/, ''));
  if (/^-?\d+\.\d+[fFdD]?$/.test(expr)) return parseFloat(expr.replace(/[fFdD]$/, ''));

  // Variable reference (check local + prototype chain via Object.create)
  if (vars[expr] !== undefined && vars[expr] !== null && typeof vars[expr] === 'object' && 'value' in vars[expr]) return vars[expr].value;

  // --- new Type<>() expressions — must be checked before comparison operators
  //     because generics contain < > that would be misinterpreted as comparisons ---
  if (expr.startsWith('new ')) {
    const staticResult = tryStaticCall(expr, vars, arrays);
    if (staticResult !== undefined) return staticResult;
  }

  // --- Ternary ---
  const ternResult = tryTernary(expr, vars, arrays);
  if (ternResult !== undefined) return ternResult;

  // --- Logical operators ---
  const logResult = tryLogical(expr, vars, arrays);
  if (logResult !== undefined) return logResult;

  // --- Comparison operators ---
  const cmpResult = tryComparison(expr, vars, arrays);
  if (cmpResult !== undefined) return cmpResult;

  // --- String concatenation with + ---
  const concatResult = tryConcatenation(expr, vars, arrays);
  if (concatResult !== undefined) return concatResult;

  // --- Arithmetic ---
  const arithResult = tryArithmetic(expr, vars, arrays);
  if (arithResult !== undefined) return arithResult;

  // --- Method calls ---
  const methodResult = tryMethodCall(expr, vars, arrays);
  if (methodResult !== undefined) return methodResult;

  // --- Static method calls ---
  const staticResult = tryStaticCall(expr, vars, arrays);
  if (staticResult !== undefined) return staticResult;

  // --- Array element access: arr[idx] ---
  const arrAccessMatch = /^([\w]+)\[(.+)\]$/.exec(expr);
  if (arrAccessMatch) {
    const [, arrName, idxExpr] = arrAccessMatch;
    const arr = arrays[arrName] || vars[arrName];
    if (arr) {
      const idx = evaluateExpr(idxExpr, vars, arrays);
      const vals = arr.values || arr.value || [];
      return vals[idx];
    }
  }

  // --- Array.length ---
  const lenMatch = /^(\w+)\.length$/.exec(expr);
  if (lenMatch) {
    const arr = arrays[lenMatch[1]] || vars[lenMatch[1]];
    if (arr) return (arr.values || arr.value || []).length;
  }

  // --- Parenthesized expression ---
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return evaluateExpr(expr.slice(1, -1), vars, arrays);
  }

  // --- Unary operators ---
  if (expr.startsWith('!')) return !isTruthy(evaluateExpr(expr.slice(1), vars, arrays));
  if (expr.startsWith('-') && expr.length > 1 && !expr.startsWith('- ')) {
    const val = evaluateExpr(expr.slice(1), vars, arrays);
    return typeof val === 'number' ? -val : val;
  }

  // --- toString / String.valueOf ---
  if (expr.endsWith('.toString()')) {
    return String(evaluateExpr(expr.slice(0, -11), vars, arrays));
  }
  const svMatch = /^String\.valueOf\((.+)\)$/.exec(expr);
  if (svMatch) return String(evaluateExpr(svMatch[1], vars, arrays));

  // Final: return as-is
  if (!isNaN(Number(expr)) && expr !== '') return Number(expr);
  return expr;
}

function tryTernary(expr, vars, arrays) {
  let depth = 0, inStr = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && ch === '?') {
        let d2 = 0, inStr2 = false;
        for (let j = i + 1; j < expr.length; j++) {
          const c2 = expr[j];
          if (c2 === '"') inStr2 = !inStr2;
          if (!inStr2) {
            if (c2 === '(') d2++;
            if (c2 === ')') d2--;
            if (d2 === 0 && c2 === ':') {
              const cond = evaluateExpr(expr.slice(0, i), vars, arrays);
              const trueVal = evaluateExpr(expr.slice(i + 1, j), vars, arrays);
              const falseVal = evaluateExpr(expr.slice(j + 1), vars, arrays);
              return isTruthy(cond) ? trueVal : falseVal;
            }
          }
        }
        break;
      }
    }
  }
  return undefined;
}

function tryLogical(expr, vars, arrays) {
  for (const op of ['||', '&&']) {
    let depth = 0, inStr = false;
    for (let i = expr.length - 1; i >= 1; i--) {
      const ch = expr[i];
      if (ch === '"') inStr = !inStr;
      if (!inStr) {
        if (ch === ')') depth++;
        if (ch === '(') depth--;
        if (depth === 0 && expr.slice(i, i + op.length) === op) {
          const left = evaluateExpr(expr.slice(0, i), vars, arrays);
          const right = evaluateExpr(expr.slice(i + op.length), vars, arrays);
          if (op === '||') return isTruthy(left) || isTruthy(right);
          if (op === '&&') return isTruthy(left) && isTruthy(right);
        }
      }
    }
  }
  return undefined;
}

function tryComparison(expr, vars, arrays) {
  const ops = ['==', '!=', '<=', '>=', '<', '>'];
  for (const op of ops) {
    let depth = 0, inStr = false;
    for (let i = expr.length - 1; i >= 1; i--) {
      const ch = expr[i];
      if (ch === '"') inStr = !inStr;
      if (!inStr) {
        if (ch === ')') depth++;
        if (ch === '(') depth--;
        if (depth === 0 && expr.slice(i - op.length + 1, i + 1) === op) {
          const left = evaluateExpr(expr.slice(0, i - op.length + 1), vars, arrays);
          const right = evaluateExpr(expr.slice(i + 1), vars, arrays);
          switch (op) {
            case '==': return left == right;
            case '!=': return left != right;
            case '<': return left < right;
            case '>': return left > right;
            case '<=': return left <= right;
            case '>=': return left >= right;
          }
        }
      }
    }
  }
  return undefined;
}

function tryConcatenation(expr, vars, arrays) {
  let depth = 0, inStr = false;
  for (let i = expr.length - 1; i >= 1; i--) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === ')') depth++;
      if (ch === '(') depth--;
      if (depth === 0 && ch === '+') {
        if (i + 1 < expr.length && expr[i + 1] === '+') continue;
        if (i > 0 && expr[i - 1] === '+') continue;

        const left = evaluateExpr(expr.slice(0, i), vars, arrays);
        const right = evaluateExpr(expr.slice(i + 1), vars, arrays);

        if (typeof left === 'string' || typeof right === 'string') {
          return String(left ?? 'null') + String(right ?? 'null');
        }
        return undefined;
      }
    }
  }
  return undefined;
}

function tryArithmetic(expr, vars, arrays) {
  let depth = 0, inStr = false;

  // * / %
  for (const op of ['*', '/', '%']) {
    depth = 0; inStr = false;
    for (let i = 1; i < expr.length - 1; i++) {
      const ch = expr[i];
      if (ch === '"') inStr = !inStr;
      if (!inStr) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth === 0 && ch === op) {
          const left = evaluateExpr(expr.slice(0, i), vars, arrays);
          const right = evaluateExpr(expr.slice(i + 1), vars, arrays);
          if (typeof left === 'number' && typeof right === 'number') {
            if (op === '*') return left * right;
            if (op === '/') { if (right === 0) { const e = new Error('java.lang.ArithmeticException: / by zero'); e._javaException = true; throw e; } return left / right; }
            if (op === '%') return left % right;
          }
        }
      }
    }
  }

  // + - (from right for left-associativity)
  depth = 0; inStr = false;
  for (let i = expr.length - 1; i >= 2; i--) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === ')') depth++;
      if (ch === '(') depth--;
      if (depth === 0 && (ch === '+' || ch === '-')) {
        if (ch === '-' && i === 0) continue;
        if (ch === '-' && i > 0 && '+-*/(%= '.includes(expr[i - 1])) continue;
        if (ch === '+' && i + 1 < expr.length && expr[i + 1] === '+') continue;

        const left = evaluateExpr(expr.slice(0, i), vars, arrays);
        const right = evaluateExpr(expr.slice(i + 1), vars, arrays);

        if (typeof left === 'number' && typeof right === 'number') {
          return ch === '+' ? left + right : left - right;
        }
      }
    }
  }

  return undefined;
}

function tryMethodCall(expr, vars, arrays) {
  const methodMatch = /^(\w+)\.([\w]+)\((.*)?\)$/.exec(expr);
  if (methodMatch) {
    const [, objName, method, argsStr] = methodMatch;
    const obj = vars[objName] || arrays[objName];
    if (!obj) return undefined;

    const val = obj.value;

    // --- HashMap methods ---
    if (val && val._type === 'HashMap') {
      const data = val._data;
      switch (method) {
        case 'put': {
          const parts = argsStr ? smartSplit(argsStr) : [];
          const key = evaluateExpr(parts[0]?.trim(), vars, arrays);
          const value = parts[1] ? evaluateExpr(parts[1].trim(), vars, arrays) : undefined;
          data[key] = value;
          return value;
        }
        case 'get': {
          const key = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          return data[key];
        }
        case 'containsKey': {
          const key = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          return key in data;
        }
        case 'containsValue': {
          const value = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          return Object.values(data).some(v => v === value);
        }
        case 'size': return Object.keys(data).length;
        case 'isEmpty': return Object.keys(data).length === 0;
        case 'remove': {
          const key = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          const removed = data[key];
          delete data[key];
          return removed;
        }
        case 'keySet': return { _type: 'Set', _data: Object.keys(data) };
        case 'values': return { _type: 'ArrayList', _data: Object.values(data) };
        case 'entrySet': {
          const entries = Object.entries(data).map(([k, v]) => ({ _type: 'MapEntry', key: k, value: v }));
          return { _type: 'ArrayList', _data: entries };
        }
        case 'putIfAbsent': {
          const parts = argsStr ? smartSplit(argsStr) : [];
          const key = evaluateExpr(parts[0]?.trim(), vars, arrays);
          const value = parts[1] ? evaluateExpr(parts[1].trim(), vars, arrays) : undefined;
          if (!(key in data)) data[key] = value;
          return data[key];
        }
        case 'getOrDefault': {
          const parts = argsStr ? smartSplit(argsStr) : [];
          const key = evaluateExpr(parts[0]?.trim(), vars, arrays);
          const def = parts[1] ? evaluateExpr(parts[1].trim(), vars, arrays) : null;
          return key in data ? data[key] : def;
        }
        case 'toString': {
          const entries = Object.entries(data).map(([k, v]) => `${k}=${v}`);
          return '{' + entries.join(', ') + '}';
        }
        default: return undefined;
      }
    }

    // --- ArrayList methods ---
    if (val && val._type === 'ArrayList') {
      const list = val._data;
      switch (method) {
        case 'add': {
          const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          list.push(arg);
          return true;
        }
        case 'get': {
          const idx = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : 0;
          return list[idx];
        }
        case 'set': {
          const parts = argsStr ? smartSplit(argsStr) : [];
          const idx = evaluateExpr(parts[0]?.trim(), vars, arrays);
          const val = parts[1] ? evaluateExpr(parts[1].trim(), vars, arrays) : undefined;
          const old = list[idx];
          list[idx] = val;
          return old;
        }
        case 'remove': {
          const idx = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : 0;
          if (typeof idx === 'number') return list.splice(idx, 1)[0];
          // remove by value
          const i = list.indexOf(idx);
          if (i >= 0) return list.splice(i, 1)[0];
          return false;
        }
        case 'contains': {
          const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          return list.includes(arg);
        }
        case 'indexOf': {
          const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          return list.indexOf(arg);
        }
        case 'size': return list.length;
        case 'isEmpty': return list.length === 0;
        case 'clear': list.length = 0; return undefined;
        case 'toString': return '[' + list.join(', ') + ']';
        default: return undefined;
      }
    }

    // --- HashSet methods ---
    if (val && val._type === 'HashSet') {
      const set = val._data;
      switch (method) {
        case 'add': {
          const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          if (!set.includes(arg)) { set.push(arg); return true; }
          return false;
        }
        case 'contains': {
          const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          return set.includes(arg);
        }
        case 'remove': {
          const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          const i = set.indexOf(arg);
          if (i >= 0) { set.splice(i, 1); return true; }
          return false;
        }
        case 'size': return set.length;
        case 'isEmpty': return set.length === 0;
        case 'clear': set.length = 0; return undefined;
        case 'toString': return '[' + set.join(', ') + ']';
        default: return undefined;
      }
    }

    // --- Map.Entry methods ---
    if (val && val._type === 'MapEntry') {
      switch (method) {
        case 'getKey': return val.key;
        case 'getValue': return val.value;
        case 'setValue': {
          const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : undefined;
          val.value = arg;
          return arg;
        }
        default: return undefined;
      }
    }

    // --- Exception methods ---
    if (val && val._type === 'Exception') {
      switch (method) {
        case 'toString': return val._class + ': ' + val._message;
        case 'getMessage': return val._message;
        case 'getClass': return { _type: 'Class', _name: val._class };
        case 'printStackTrace': return undefined; // side effect only
        default: return undefined;
      }
    }

    // --- String methods ---
    switch (method) {
      case 'length': return typeof val === 'string' ? val.length : (val && val.length) || 0;
      case 'toUpperCase': return typeof val === 'string' ? val.toUpperCase() : val;
      case 'toLowerCase': return typeof val === 'string' ? val.toLowerCase() : val;
      case 'trim': return typeof val === 'string' ? val.trim() : val;
      case 'charAt': {
        const idx = argsStr ? evaluateExpr(argsStr, vars, arrays) : 0;
        return typeof val === 'string' ? val.charAt(idx) : '';
      }
      case 'substring': {
        const args = argsStr ? argsStr.split(',').map(a => evaluateExpr(a.trim(), vars, arrays)) : [0];
        return typeof val === 'string' ? val.substring(args[0], args[1]) : '';
      }
      case 'indexOf': {
        const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : '';
        return typeof val === 'string' ? val.indexOf(String(arg)) : -1;
      }
      case 'contains': {
        const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : '';
        return typeof val === 'string' ? val.includes(String(arg)) : false;
      }
      case 'startsWith': {
        const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : '';
        return typeof val === 'string' ? val.startsWith(String(arg)) : false;
      }
      case 'endsWith': {
        const arg = argsStr ? evaluateExpr(argsStr.trim(), vars, arrays) : '';
        return typeof val === 'string' ? val.endsWith(String(arg)) : false;
      }
      case 'replace': {
        if (!argsStr) return val;
        const parts = argsStr.split(',');
        const old = String(evaluateExpr(parts[0].trim(), vars, arrays));
        const newV = parts[1] ? String(evaluateExpr(parts[1].trim(), vars, arrays)) : '';
        return typeof val === 'string' ? val.replace(old, newV) : val;
      }
      case 'toString': return val && val._type ? (val._type === 'HashMap' ? '{' + Object.entries(val._data).map(([k,v]) => k+'='+v).join(', ') + '}' : '[' + (val._data || []).join(', ') + ']') : String(val);
      case 'valueOf': return String(val);
      case 'parseInt': return parseInt(String(val));
      case 'parseLong': return parseInt(String(val));
      case 'parseDouble': return parseFloat(String(val));
      default: return undefined;
    }
  }

  // Chained method calls: obj.method1().method2()
  const chainMatch = /^(\w+)(?:\.([\w]+)\(([^)]*)\))+/.exec(expr);
  if (chainMatch && expr.includes('().')) {
    // Evaluate each call in sequence
    let current = evaluateExpr(chainMatch[1], vars, arrays);
    const chainParts = expr.slice(chainMatch[1].length).split(/\)\.\(/);
    for (const part of chainParts) {
      const m = /^\.?(\w+)\((.*)?$/.exec(part);
      if (m) {
        const methodName = m[1];
        const methodArgs = m[2] ? m[2].replace(/\)$/, '') : '';
        // Create temp var
        const tmpName = '__chain_tmp';
        vars[tmpName] = { type: 'object', value: current };
        current = tryMethodCall(tmpName + '.' + methodName + '(' + methodArgs + ')', vars, arrays);
        delete vars[tmpName];
      }
    }
    return current;
  }

  // Property access
  const propMatch = /^(\w+)\.(\w+)$/.exec(expr);
  if (propMatch) {
    const [, objName, prop] = propMatch;
    const obj = vars[objName] || arrays[objName];
    if (!obj) return undefined;
    if (obj.value && obj.value._type === 'HashMap' && prop === 'size') return Object.keys(obj.value._data).length;
    if (obj.value && obj.value._type === 'ArrayList' && prop === 'size') return obj.value._data.length;
    if (obj.value && obj.value._type === 'HashSet' && prop === 'size') return obj.value._data.length;
    if (prop === 'length') return (obj.values || obj.value || []).length;
  }

  return undefined;
}

function tryStaticCall(expr, vars, arrays) {
  const mathMatch = /^Math\.(\w+)\((.+)\)$/.exec(expr);
  if (mathMatch) {
    const [, fn, argsStr] = mathMatch;
    const args = argsStr.split(',').map(a => evaluateExpr(a.trim(), vars, arrays));
    switch (fn) {
      case 'abs': return Math.abs(args[0]);
      case 'max': return Math.max(args[0], args[1]);
      case 'min': return Math.min(args[0], args[1]);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'round': return Math.round(args[0]);
      case 'ceil': return Math.ceil(args[0]);
      case 'floor': return Math.floor(args[0]);
      case 'pow': return Math.pow(args[0], args[1]);
      case 'random': return Math.floor(Math.random() * (args[0] || 100));
      default: return 0;
    }
  }

  const parseMatch = /^(?:Integer|Long|Double|Float)\.(parseInt|parseLong|parseDouble|parseFloat)\((.+)\)$/.exec(expr);
  if (parseMatch) {
    const arg = evaluateExpr(parseMatch[2], vars, arrays);
    switch (parseMatch[1]) {
      case 'parseInt': return parseInt(String(arg));
      case 'parseLong': return parseInt(String(arg));
      case 'parseDouble': return parseFloat(String(arg));
      case 'parseFloat': return parseFloat(String(arg));
    }
  }

  // new ArrayList<>(){...} or new ArrayList<>(collection)
  const arrayListMatch = /^new\s+ArrayList<(?:\w*)?>\((.*)\)$/.exec(expr);
  if (arrayListMatch) {
    const inner = arrayListMatch[1].trim();
    if (!inner) return { _type: 'ArrayList', _data: [] };
    // ArrayList<>(Arrays.asList(...))
    const asListMatch = /^Arrays\.asList\((.+)\)$/.exec(inner);
    if (asListMatch) {
      const items = smartSplit(asListMatch[1]).map(a => evaluateExpr(a.trim(), vars, arrays));
      return { _type: 'ArrayList', _data: items };
    }
    // ArrayList<>(List.of(...))
    const listOfMatch = /^List\.of\((.+)\)$/.exec(inner);
    if (listOfMatch) {
      const items = smartSplit(listOfMatch[1]).map(a => evaluateExpr(a.trim(), vars, arrays));
      return { _type: 'ArrayList', _data: items };
    }
    // ArrayList<>(otherList)
    const otherList = evaluateExpr(inner, vars, arrays);
    if (otherList && otherList._type === 'ArrayList') return { _type: 'ArrayList', _data: [...otherList._data] };
    if (Array.isArray(otherList)) return { _type: 'ArrayList', _data: [...otherList] };
    return { _type: 'ArrayList', _data: [] };
  }

  // new HashMap<>()
  const hashMapMatch = /^new\s+HashMap<(?:\w*,\s*\w*)?>\((.*)\)$/.exec(expr);
  if (hashMapMatch) {
    const inner = hashMapMatch[1].trim();
    if (!inner) return { _type: 'HashMap', _data: {} };
    return { _type: 'HashMap', _data: {} };
  }

  // new LinkedHashMap<>()
  const linkedHashMapMatch = /^new\s+LinkedHashMap<(?:\w*,\s*\w*)?>\(\)$/.exec(expr);
  if (linkedHashMapMatch) return { _type: 'HashMap', _data: {} };

  // new HashSet<>()
  const hashSetMatch = /^new\s+HashSet<(?:\w*)?>\(\)$/.exec(expr);
  if (hashSetMatch) return { _type: 'HashSet', _data: [] };

  // new LinkedList<>()
  const linkedListMatch = /^new\s+LinkedList<(?:\w*)?>\(\)$/.exec(expr);
  if (linkedListMatch) return { _type: 'ArrayList', _data: [] };

  const listMatch = /^List\.of\((.+)\)$/.exec(expr);
  if (listMatch) {
    const items = smartSplit(listMatch[1]).map(a => evaluateExpr(a.trim(), vars, arrays));
    return { _type: 'ArrayList', _data: items };
  }

  const setMatch = /^Set\.of\((.+)\)$/.exec(expr);
  if (setMatch) {
    const items = smartSplit(setMatch[1]).map(a => evaluateExpr(a.trim(), vars, arrays));
    const unique = [...new Set(items)];
    return { _type: 'HashSet', _data: unique };
  }

  const mapOfMatch = /^Map\.of\((.+)\)$/.exec(expr);
  if (mapOfMatch) {
    const items = smartSplit(mapOfMatch[1]).map(a => evaluateExpr(a.trim(), vars, arrays));
    const data = {};
    for (let k = 0; k < items.length; k += 2) data[items[k]] = items[k + 1];
    return { _type: 'HashMap', _data: data };
  }

  // Map.ofEntries(Map.entry(...))
  const mapEntriesMatch = /^Map\.ofEntries\((.+)\)$/.exec(expr);
  if (mapEntriesMatch) {
    const data = {};
    const entryRegex = /Map\.entry\(([^,]+),\s*(.+)\)/g;
    let m;
    while ((m = entryRegex.exec(mapEntriesMatch[1])) !== null) {
      const key = evaluateExpr(m[1].trim(), vars, arrays);
      const val = evaluateExpr(m[2].trim(), vars, arrays);
      data[key] = val;
    }
    return { _type: 'HashMap', _data: data };
  }

  const atsMatch = /^Arrays\.toString\((\w+)\)$/.exec(expr);
  if (atsMatch) {
    const obj = arrays[atsMatch[1]] || vars[atsMatch[1]];
    if (obj && obj._type === 'ArrayList') return '[' + obj._data.join(', ') + ']';
    if (obj && obj._data && Array.isArray(obj.values || [])) return '[' + (obj.values || []).join(', ') + ']';
    if (obj) return '[' + (obj.values || obj.value || []).join(', ') + ']';
  }

  // Collections.sort(list)
  const collSortMatch = /^Collections\.sort\((\w+)\)$/.exec(expr);
  if (collSortMatch) {
    const listVar = vars[collSortMatch[1]];
    if (listVar && listVar.value && listVar.value._type === 'ArrayList') {
      listVar.value._data.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    }
    return undefined;
  }

  // Collections.reverse(list)
  const collReverseMatch = /^Collections\.reverse\((\w+)\)$/.exec(expr);
  if (collReverseMatch) {
    const listVar = vars[collReverseMatch[1]];
    if (listVar && listVar.value && listVar.value._type === 'ArrayList') {
      listVar.value._data.reverse();
    }
    return undefined;
  }

  // Arrays.sort(array)
  const arrSortMatch = /^Arrays\.sort\((\w+)\)$/.exec(expr);
  if (arrSortMatch) {
    const arr = arrays[arrSortMatch[1]];
    if (arr) arr.values.sort((a, b) => a - b);
    return undefined;
  }

  const sfMatch = /^String\.format\("([^"]+)"(?:,\s*(.+))?\)$/.exec(expr);
  if (sfMatch) {
    let fmt = sfMatch[1];
    if (sfMatch[2]) {
      const args = smartSplit(sfMatch[2]).map(a => evaluateExpr(a.trim(), vars, arrays));
      let idx = 0;
      fmt = fmt.replace(/%(\.\d+f|d|s|f)/g, (match) => {
        if (idx >= args.length) return match;
        const val = args[idx++];
        if (match === '%.2f') return Number(val).toFixed(2);
        if (match === '%d') return Math.round(Number(val));
        if (match === '%s') return String(val);
        return String(val);
      });
    }
    return fmt;
  }

  return undefined;
}

function smartSplit(s) {
  const parts = [];
  let current = '';
  let inString = false;
  let parenDepth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') inString = !inString;
    if (!inString && ch === '(') parenDepth++;
    if (!inString && ch === ')') parenDepth--;
    if (!inString && parenDepth === 0 && ch === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseLiteral(s) {
  s = s.trim();
  if (s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s.replace(/"/g, '');
}

function isTruthy(val) {
  if (val === null || val === undefined || val === false || val === 0 || val === '') return false;
  return true;
}
