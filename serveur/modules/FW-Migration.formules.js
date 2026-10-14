/* FW-Migration — analyseur de formules : copie fidèle de celui de FIWAKTI (moteur de formules du socle, v56.30) ; sert à
   contrôler une formule importée (syntaxe, fonctions, variables) avant toute écriture. */
"use strict";
const FUNCS = {
  SI:3, IF:3, MIN:-1, MAX:-1, ABS:1, ARRONDI:2, ROUND:2, ET:-1, AND:-1,
  OU:-1, OR:-1, NON:1, NOT:1, CUM:1, MOD:2, ENT:1, INT:1, PLAFOND:2, PLANCHER:2
};
const FUNC_ALIAS = {IF:"SI", ROUND:"ARRONDI", AND:"ET", OR:"OU", NOT:"NON", INT:"ENT"};

function tokenize(src){
  const out = []; let i = 0;
  const isD = c => c>="0" && c<="9";
  const isA = c => /[A-Za-z_\u00C0-\u00FF]/.test(c);
  while (i < src.length){
    const c = src[i];
    if (/\s/.test(c)){ i++; continue; }
    if (isD(c) || (c==="." && isD(src[i+1]))){
      let j = i; while (j<src.length && (isD(src[j])||src[j]===".")) j++;
      out.push({t:"num", v:parseFloat(src.slice(i,j))}); i = j; continue;
    }
    if (isA(c)){
      let j = i; while (j<src.length && (isA(src[j])||isD(src[j]))) j++;
      out.push({t:"id", v:src.slice(i,j).toUpperCase()}); i = j; continue;
    }
    const two = src.substr(i,2);
    if (two==="<="||two===">="||two==="<>"||two==="!="){ out.push({t:"op", v:(two==="!="?"<>":two)}); i+=2; continue; }
    if ("+-*/()<>=".indexOf(c) >= 0){ out.push({t:"op", v:c}); i++; continue; }
    if (c===";" || c===","){ out.push({t:"op", v:";"}); i++; continue; }
    throw new Error("Caractere inattendu : " + c);
  }
  return out;
}

function parseFormula(src){
  let tk, p = 0;
  try { tk = tokenize(src||""); } catch(e){ return {ok:false, err:e.message}; }
  if (!tk.length) return {ok:false, err:"Formule vide"};
  const peek = () => tk[p];
  const need = v => { if (tk[p] && tk[p].v===v){ p++; return true; } throw new Error("« "+v+" » attendu"); };

  function expr(){ return orE(); }
  function orE(){ let n = andE(); while (peek() && peek().t==="id" && (peek().v==="OU"||peek().v==="OR")){ p++; n = {k:"bin", op:"OU", a:n, b:andE()}; } return n; }
  function andE(){ let n = cmpE(); while (peek() && peek().t==="id" && (peek().v==="ET"||peek().v==="AND")){ p++; n = {k:"bin", op:"ET", a:n, b:cmpE()}; } return n; }
  function cmpE(){
    let n = addE();
    while (peek() && ["<",">","=","<=",">=","<>"].indexOf(peek().v) >= 0){
      const o = tk[p++].v; n = {k:"bin", op:o, a:n, b:addE()};
    }
    return n;
  }
  function addE(){ let n = mulE(); while (peek() && (peek().v==="+"||peek().v==="-")){ const o=tk[p++].v; n={k:"bin",op:o,a:n,b:mulE()}; } return n; }
  function mulE(){ let n = unE(); while (peek() && (peek().v==="*"||peek().v==="/")){ const o=tk[p++].v; n={k:"bin",op:o,a:n,b:unE()}; } return n; }
  function unE(){
    if (peek() && peek().v==="-"){ p++; return {k:"neg", a:unE()}; }
    if (peek() && peek().v==="+"){ p++; return unE(); }
    return prim();
  }
  function prim(){
    const tok = peek();
    if (!tok) throw new Error("Fin de formule inattendue");
    if (tok.t==="num"){ p++; return {k:"num", v:tok.v}; }
    if (tok.v==="("){ p++; const n = expr(); need(")"); return n; }
    if (tok.t==="id"){
      p++;
      const raw = tok.v, name = FUNC_ALIAS[raw] || raw;
      if (peek() && peek().v==="("){
        if (!(raw in FUNCS)) throw new Error("Fonction inconnue : " + raw);
        p++;
        const args = [];
        if (!(peek() && peek().v===")")){
          args.push(expr());
          while (peek() && peek().v===";"){ p++; args.push(expr()); }
        }
        need(")");
        const ar = FUNCS[raw];
        if (ar > 0 && args.length !== ar) throw new Error(raw + " attend " + ar + " argument(s)");
        if (ar === -1 && args.length < 1) throw new Error(raw + " attend au moins un argument");
        if (name==="CUM" && args[0].k!=="var") throw new Error("CUM attend un code de compteur");
        return {k:"fn", name:name, args:args};
      }
      return {k:"var", v:raw};
    }
    throw new Error("Element inattendu : " + tok.v);
  }

  try {
    const ast = expr();
    if (p < tk.length) throw new Error("Element en trop : " + tk[p].v);
    return {ok:true, ast:ast};
  } catch(e){ return {ok:false, err:e.message}; }
}

function refsOf(ast){
  const vars = [], cums = [];
  (function walk(n){
    if (!n) return;
    if (n.k==="var"){ if (vars.indexOf(n.v)<0) vars.push(n.v); return; }
    if (n.k==="fn"){
      if (n.name==="CUM"){ const c = n.args[0].v; if (cums.indexOf(c)<0) cums.push(c); return; }
      n.args.forEach(walk); return;
    }
    if (n.k==="bin"){ walk(n.a); walk(n.b); return; }
    if (n.k==="neg"){ walk(n.a); }
  })(ast);
  return {vars:vars, cums:cums};
}
module.exports = {parseFormula, refsOf, FUNCS};
