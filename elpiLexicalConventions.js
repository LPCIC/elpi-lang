
function or(a, ...args) { return function() {
  return "(" + args.reduce((acc,x) => { return acc + "|" + x(); },a()) + ")";
}}
function star(a) { return function() {
  return "("+a()+")*";
}}
function cat(...args) { return function() {
  return "(" + args.reduce( (acc, x) => { return acc + x(); }, "") + ")";
}}
function plus(a) { return function() {
  return cat(a,star(a))();
}}
function it(x) { return function() {
  return x;
}}

function chop_brks(s) {
  console.assert(s[0] === '[',"does not start with [  :",s);
  console.assert(s[s.length-1] === ']',"does not end with ] :",s);
  return s.slice(1,-1);
}
function or_set(...args) { return function() {
  return "[" + args.reduce((acc,x) => { return acc + chop_brks(x()); },"") + "]";
}}
function neg_lookbehind(...x) { return function() {
  return "(?<!" + or_set(...x)() + ")";
}}

/* constants */
function dot() { return "\\\\."; }
function lparen() { return "\\\\("; }
function rparen() { return "\\\\)"; }
function tab() { return "\\\\t"; }
function space() { return " "; }
function minus() { return "-"; }
function underscore() { return "_"; }
function colon() { return ":"; }

/* Names from elpi's parser.ml */
function digit () { return "[0-9]"; }
function schar2() { return "[+*/^<>`'?@#~=&!]"; }
function schar() { return or_set(schar2,it("[\\\\-$_]"))(); }
function ucase() { return "[A-Z]"; }
function lcase() { return "[a-z]"; }
function idchar() { return or_set(lcase,ucase,digit,schar)(); }
function idcharstar() { return star(idchar)(); }
function nsid() { return cat(dot,or(lcase,ucase))(); }
function idcharstarns() { return star(or(idchar,nsid))(); }
function idcharplus() { return plus(idchar)(); }
function pnum() { return plus(digit)(); }
function num() { return or(pnum,cat(minus,pnum))(); }
function symbchar() { return or(lcase,ucase,digit,schar,colon)(); }
function symbcharstar() { return star(symbchar)(); }

function blanks() { return star(or(space,tab))(); }
function ident() { return or(
  cat(lcase,idcharstarns),
  cat(schar2,symbcharstar),
  cat(minus,idcharplus),
)(); }

module.exports = {
    "0" : "CAVEAT: instead of \\ one should write \\\\",

    "1" : "identifiers like the name of a predicate, eg std.do!",
    "ident" : function() { return ident(); },

    "2" : "infix symbols in prefix form, eg (+)",
    "infix" : function() { return cat(lparen,blanks,ident,blanks,rparen)(); },

    "3" : "variables, eg ThisOne",
    "var" : function() { return or(cat(ucase,idcharstar),cat(underscore,idcharstar))(); },

    "4" : "numbers, eg 10.4",
    "number" : function() { return or(num,cat(num,dot,pnum))(); },

    "5" : "word boundary left",
    "wbl" : function() { return neg_lookbehind(or_set(idchar,it("[.]")))(); },

    "6" : "very loose definition of a type expressiong",
    "typechars" : function() { return plus(or(it("[^,\\\\. %]")),nsid)(); },

    "99" : "eof"
}