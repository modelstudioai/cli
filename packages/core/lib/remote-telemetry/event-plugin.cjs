/* oxlint-disable */
module.exports = (function (e) {
  var t = {};
  function n(r) {
    if (t[r]) return t[r].exports;
    var o = (t[r] = { i: r, l: !1, exports: {} });
    return (e[r].call(o.exports, o, o.exports, n), (o.l = !0), o.exports);
  }
  return (
    (n.m = e),
    (n.c = t),
    (n.d = function (e, t, r) {
      n.o(e, t) || Object.defineProperty(e, t, { enumerable: !0, get: r });
    }),
    (n.r = function (e) {
      ("undefined" != typeof Symbol &&
        Symbol.toStringTag &&
        Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }),
        Object.defineProperty(e, "__esModule", { value: !0 }));
    }),
    (n.t = function (e, t) {
      if ((1 & t && (e = n(e)), 8 & t)) return e;
      if (4 & t && "object" == typeof e && e && e.__esModule) return e;
      var r = Object.create(null);
      if (
        (n.r(r),
        Object.defineProperty(r, "default", { enumerable: !0, value: e }),
        2 & t && "string" != typeof e)
      )
        for (var o in e)
          n.d(
            r,
            o,
            function (t) {
              return e[t];
            }.bind(null, o),
          );
      return r;
    }),
    (n.n = function (e) {
      var t =
        e && e.__esModule
          ? function () {
              return e.default;
            }
          : function () {
              return e;
            };
      return (n.d(t, "a", t), t);
    }),
    (n.o = function (e, t) {
      return Object.prototype.hasOwnProperty.call(e, t);
    }),
    (n.p = ""),
    n((n.s = 0))
  );
})([
  function (e, t, n) {
    "use strict";
    n.r(t);
    var r = ["ec", "ea", "el", "et"];
    var o = function (e, t) {
      var n = function (e) {
        var n = e.ec,
          r = e.ea,
          o = e.el,
          l = e.et,
          u = void 0 === l ? "CLK" : l,
          a = e.xpath;
        (delete e.ec,
          delete e.ea,
          delete e.el,
          delete e.et,
          delete e.xpath,
          (e.p1 = n),
          (e.p2 = r),
          (e.p3 = o),
          (e.p4 = u),
          (e.p5 = a));
        try {
          t.log("event", e);
        } catch (e) {}
      };
      return function () {
        var t = arguments,
          o = {};
        if (0 !== t.length) {
          for (var l = 0; l < t.length; l++) {
            var u,
              a,
              i = t[l];
            if (0 !== l && "object" == typeof i && l !== t.length - 1)
              return void (
                null == e ||
                null === (u = e.console) ||
                void 0 === u ||
                null === (a = u.warn) ||
                void 0 === a ||
                a.call(u, "Only the last argument can be object type")
              );
            if ("string" == typeof i || "number" == typeof i) o[r[l]] = i;
            else if ("object" == typeof i && l === t.length - 1)
              for (var c in i) i.hasOwnProperty(c) && (o[c] = i[c]);
          }
          n(o);
        } else {
          var f, p;
          null === (f = e.console) ||
            void 0 === f ||
            null === (p = f.warn) ||
            void 0 === p ||
            p.call(f, "At lease one augument");
        }
      };
    };
    t.default = function (e, t) {
      return o(global, e);
    };
  },
]).default;
