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
    n((n.s = 8))
  );
})([
  function (e, t) {
    e.exports = require("os");
  },
  function (e, t) {
    e.exports = globalThis.fetch;
  },
  function (e, t, n) {
    "use strict";
    e.exports = n(6);
  },
  function (e, t) {
    e.exports = require("dns");
  },
  function (e, t) {
    e.exports = require("util");
  },
  function (e, t) {
    e.exports = require("crypto");
  },
  function (e, t, n) {
    Object.defineProperty(t, Symbol.toStringTag, { value: "Module" });
    const r = n(7),
      o = (e, t) => {
        ((t.appName = "BaiduSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Baidu"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      i = (e, t) => {
        ((t.appName = "360 Spider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "360"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      a = (e, t) => {
        ((t.appName = "BingBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Microsoft"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      u = (e, t) => {
        ((t.appName = "Googlebot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Google"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      p = (e, t) => {
        ((t.appName = "YandexBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Yandex"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      l = (e, t) => {
        ("Sogou web spider" === e.getPreviousNTokens(3) &&
          ((t.deviceBrand = "Sogou.com"), (t.appName = "SogouSpider")),
          (t.appVersion = e.value),
          (t.deviceType = "bot"));
      },
      s = (e, t) => {
        ((t.appName = "DataproviderBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Dataprovider.com"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      c = (e, t) => {
        ((t.appName = "AhrefsBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Ahrefs"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      d = (e, t) => {
        ((t.appName = "BitSightBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Bitsight"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      f = (e, t) => {
        ((t.appName = "oBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "IBM"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      v = (e, t) => {
        ((t.appName = "Cincraw"),
          (t.appVersion = e.value),
          (t.deviceBrand = "CINC"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      g = (e, t) => {
        ((t.appName = "DingTalkBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Alibaba"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      h = (e, t) => {
        ((t.appName = "YisouSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Alibaba"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      m = (e, t) => {
        ((t.appName = "ByteSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "ByteDance"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      b = (e, t) => {
        ((t.appName = "HeadlineCrawler"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Headline.com"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      y = (e, t) => {
        ((t.appName = "BitDiscoveryBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Tenable"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      _ = (e, t) => {
        ("Screaming Frog SEO Spider" === e.getPreviousNTokens(4) &&
          ((t.deviceBrand = "Screaming Frog"), (t.appName = "Screaming Frog")),
          (t.appVersion = e.value),
          (t.deviceType = "bot"));
      },
      B = (e, t) => {
        ((t.appName = "Ai2Bot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Ai2"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      S = (e, t) => {
        ((t.appName = "DianjingAdSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Dianjing"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      T = (e, t) => {
        ((t.appName = "BaiduSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Baidu"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      j = (e, t) => {
        ((t.appName = "360 Spider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "360"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      N = (e, t) => {
        ((t.appName = "BingBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Microsoft"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      w = (e, t) => {
        ((t.appName = "Googlebot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Google"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      O = (e, t) => {
        ((t.appName = "YandexBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Yandex"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      V = (e, t) => {
        ("Sogou web spider" === e.getPreviousNTokens(3) &&
          ((t.deviceBrand = "Sogou.com"), (t.appName = "SogouSpider")),
          (t.appVersion = e.value),
          (t.deviceType = "bot"));
      },
      A = (e, t) => {
        ((t.appName = "DataproviderBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Dataprovider.com"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      D = (e, t) => {
        ((t.appName = "AhrefsBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Ahrefs"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      k = (e, t) => {
        ((t.appName = "BitSightBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Bitsight"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      P = (e, t) => {
        ((t.appName = "oBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "IBM"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      C = (e, t) => {
        ((t.appName = "Cincraw"),
          (t.appVersion = e.value),
          (t.deviceBrand = "CINC"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      E = (e, t) => {
        ((t.appName = "DingTalkBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Alibaba"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      x = (e, t) => {
        ((t.appName = "YisouSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Alibaba"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      M = (e, t) => {
        ((t.appName = "ByteSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "ByteDance"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      q = (e, t) => {
        ((t.appName = "HeadlineCrawler"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Headline.com"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      I = (e, t) => {
        ((t.appName = "BitDiscoveryBot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Tenable"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      H = (e, t) => {
        ("Screaming Frog SEO Spider" === e.getPreviousNTokens(4) &&
          ((t.deviceBrand = "Screaming Frog"), (t.appName = "Screaming Frog")),
          (t.appVersion = e.value),
          (t.deviceType = "bot"));
      },
      U = (e, t) => {
        ((t.appName = "Ai2Bot"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Ai2"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      L = (e, t) => {
        ((t.appName = "DianjingAdSpider"),
          (t.appVersion = e.value),
          (t.deviceBrand = "Dianjing"),
          (t.deviceType = "bot"),
          (t.platform = "other"));
      },
      Q = new Map(),
      R = new Map();
    (Q.set("Baiduspider-render", o),
      Q.set("Baiduspider+", o),
      Q.set("Baiduspider-image+", o),
      Q.set("360Spider", i),
      Q.set("360Spider-Image", i),
      Q.set("bingbot", a),
      Q.set("Googlebot", u),
      Q.set("YandexRenderResourcesBot", p),
      Q.set("spider", l),
      Q.set("Dataprovider.com", s),
      Q.set("AhrefsBot", c),
      Q.set("BitSightBot", d),
      Q.set("oBot", f),
      Q.set("Cincraw", v),
      Q.set("DingTalkBot-LinkService", g),
      Q.set("YisouSpider", h),
      Q.set("Bytespider", m),
      Q.set("ev-crawler", b),
      Q.set("bitdiscovery", y),
      Q.set("Spider", _),
      Q.set("Ai2Bot-Dolma", B),
      Q.set("dianjing_ad_spider", S),
      R.set("Baiduspider-render", T),
      R.set("Baiduspider+", T),
      R.set("Baiduspider-image+", T),
      R.set("360Spider", j),
      R.set("360Spider-Image", j),
      R.set("bingbot", N),
      R.set("Googlebot", w),
      R.set("YandexRenderResourcesBot", O),
      R.set("spider", V),
      R.set("Dataprovider.com", A),
      R.set("AhrefsBot", D),
      R.set("BitSightBot", k),
      R.set("oBot", P),
      R.set("Cincraw", C),
      R.set("DingTalkBot-LinkService", E),
      R.set("YisouSpider", x),
      R.set("Bytespider", M),
      R.set("ev-crawler", q),
      R.set("bitdiscovery", I),
      R.set("Spider", H),
      R.set("Ai2Bot-Dolma", U),
      R.set("dianjing_ad_spider", L));
    const F = {
      productHandlerMap: Q,
      commentHandlerMap: R,
      getSpecialProductHandler: () => null,
      getSpecialCommentHandler: () => null,
      getDefaultModelHandler: () => null,
    };
    t.isBot = function (e) {
      const t = r.createUAInfo();
      return (r.runTask(e, t, F), "bot" === t.deviceType);
    };
  },
  function (e, t) {
    function n(e) {
      const t = [],
        n = {
          parent: e,
          tokens: t,
          get firstToken() {
            return 0 === t.length ? null : t[0];
          },
          getNewToken(r) {
            const o = (function () {
              const e = [],
                t = [],
                n = [];
              let r = null,
                o = null,
                i = null,
                a = !0,
                u = !0,
                p = !0,
                l = null;
              const s = {
                get key() {
                  return (a && ((r = e.join("")), (a = !1)), r);
                },
                get value() {
                  return (u && ((o = t.join("")), (u = !1)), o);
                },
                get originValue() {
                  return (p && ((i = n.join("")), (p = !1)), i);
                },
                previousToken: null,
                properties: null,
                appendKey(t) {
                  (e.push(t), (a = !0));
                },
                appendValue(e) {
                  (t.push("_" === e ? "." : e), n.push(e), (u = !0), (p = !0), (l = null));
                },
                getSplitValue(e) {
                  if (null === l) {
                    const e = s.value;
                    l = "" === e ? [] : e.split("/");
                  }
                  return e >= 0 && e < l.length ? l[e] : null;
                },
                getPreviousNTokens(e) {
                  const t = [];
                  let n = s;
                  for (let r = 0; r < e; r++) {
                    if (null == n) return null;
                    (t.unshift(n.key), (n = n.previousToken));
                  }
                  return t.join(" ");
                },
              };
              return s;
            })();
            return (
              t.push(o),
              (o.previousToken = void 0 !== r ? r : t.length > 1 ? t[t.length - 2] : null),
              e && (e.properties = n),
              o
            );
          },
          getLastToken: () => (0 === t.length ? null : t[t.length - 1]),
          getFirstToken: () => (0 === t.length ? null : t[0]),
          isEmpty: () => 0 === t.length,
        };
      return n;
    }
    function r() {
      return {
        appName: null,
        appVersion: null,
        browserName: null,
        browserVersion: null,
        engineName: null,
        engineVersion: null,
        deviceBrand: null,
        deviceModel: null,
        deviceType: "mobile",
        osName: null,
        osVersion: null,
        platform: "web",
        tokenGroup: n(null),
      };
    }
    const o = new Set(" ;,\"'".split("")),
      i = new Set("/=:".split("")),
      a = new Set([
        "Mozilla",
        "AppleWebKit",
        "Safari",
        "Opera",
        "Dalvik",
        "com.ss.android.ugc.aweme",
      ]);
    function u(e) {
      return 1 === e.length && o.has(e);
    }
    function p(e) {
      return 1 === e.length && i.has(e);
    }
    function l(e, t, n, r) {
      if (null == e) return;
      const o = t.parent,
        i = e.key;
      let u = null;
      if (null != o) {
        const e = o.key;
        var p, l;
        if (a.has(e))
          ((u = null !== (p = r.commentHandlerMap.get(i)) && void 0 !== p ? p : null),
            null == u && (u = r.getSpecialCommentHandler(i)),
            null == u && i.endsWith(" Build") && (u = r.getDefaultModelHandler()));
        else
          u =
            null !== (l = r.productHandlerMap.get(i)) && void 0 !== l
              ? l
              : r.getSpecialProductHandler(i);
      } else {
        var s;
        u =
          null !== (s = r.productHandlerMap.get(i)) && void 0 !== s
            ? s
            : r.getSpecialProductHandler(i);
      }
      if (null != u)
        try {
          u(e, n);
        } catch (e) {}
    }
    function s(e, t, r) {
      if (null == e) throw new Error("input can not be null");
      return (
        (function e(t, r, o, i, a) {
          let s,
            c = null,
            d = null,
            f = !1;
          const v = t.length;
          let g = r > 0 ? t[r - 1] : "\0";
          for (s = r; s < v; s++) {
            const h = t[s];
            if (u(h)) {
              const e = "\0" !== g && u(g);
              if (!f && r > 0 && " " === h && !e) {
                const e = s + 1;
                if (e < v) {
                  const n = t[e];
                  /\d/.test(n) || "-" === n ? (f = !0) : null != d && d.appendKey(h);
                } else null != d && d.appendKey(h);
              } else null != d && ((c = d), (d = null));
              g = h;
            } else if ("(" === h) {
              if ("(" === g) {
                g = h;
                continue;
              }
              const r = s;
              ((s = e(t, s + 1, n(o.getLastToken()), i, a)),
                null != d && ((c = d), (d = null)),
                (g = t[r]));
            } else {
              if (")" === h) {
                if (0 === r) {
                  g = h;
                  continue;
                }
                break;
              }
              (null == d && (l(o.getLastToken(), o, i, a), (d = o.getNewToken(c)), (f = !1)),
                p(h) ? (f && d.appendValue(h), (f = !0)) : f ? d.appendValue(h) : d.appendKey(h),
                (g = h));
            }
          }
          return (l(o.getLastToken(), o, i, a), s);
        })(e, 0, t.tokenGroup, t, r),
        t
      );
    }
    (Object.defineProperty(t, "DEFAULT_MODEL_HANDLER_KEY", {
      enumerable: !0,
      get: function () {
        return "DEFAULT_MODEL_HANDLER";
      },
    }),
      Object.defineProperty(t, "createUAInfo", {
        enumerable: !0,
        get: function () {
          return r;
        },
      }),
      Object.defineProperty(t, "runTask", {
        enumerable: !0,
        get: function () {
          return s;
        },
      }));
  },
  function (e, t, n) {
    "use strict";
    n.r(t);
    var r = n(0),
      o = n.n(r),
      i = n(1),
      a = n.n(i);
    n(2);
    function u() {
      var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 20,
        t = arguments.length > 1 ? arguments[1] : void 0;
      return (
        (t = t || ""),
        e
          ? u(
              --e,
              "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz".charAt(
                Math.floor(60 * Math.random()),
              ) + t,
            )
          : t
      );
    }
    function p(e, t) {
      for (var n in t) e[n] = t[n];
      return e;
    }
    function l(e) {
      return "[object Object]" === Object.prototype.toString.call(e);
    }
    function s(e) {
      return "undefined" != typeof Promise && e instanceof Promise;
    }
    var c = Object.freeze({ __aesBeforeSkip: 1 }),
      d = function (e) {
        var t = Object.prototype.toString.call(e);
        if (("[object String]" === t && e) || "[object Number]" === t || "[object Boolean]" === t)
          return e;
        if ("[object Object]" === t || "[object Array]" === t)
          try {
            return JSON.stringify(e);
          } catch (e) {}
      },
      f = function (e) {
        var t = {};
        for (var n in e) {
          var r = e[n];
          void 0 !== r && (t[n] = d(r));
        }
        return t;
      },
      v = function (e) {
        var t = [];
        for (var n in e) {
          var r = d(e[n]);
          void 0 !== r && t.push("".concat(n, "=").concat(encodeURIComponent(r)));
        }
        return t.join("&");
      };
    function g(e) {
      return (e.requiredFields || []).concat(["pid"]).some(function (t) {
        return void 0 === e[t];
      });
    }
    function h() {
      var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
        t = arguments.length > 1 ? arguments[1] : void 0;
      "undefined" != typeof console && console.warn("日志解析报错，埋点将被丢弃 => ".concat(e), t);
    }
    var m = "AEM_TRACKER_UNIQUE_PVID",
      b =
        "undefined" != typeof globalThis && globalThis
          ? globalThis
          : "undefined" != typeof window && window
            ? window
            : "undefined" != typeof global && global
              ? global
              : "undefined" != typeof self && self
                ? self
                : (console.error("Unable to locate global object in current environment"), {});
    function y(e) {
      ((this._queue = []),
        (this._reqQueue = []),
        (this._plugins = {}),
        (this._subscribers = { onConfigUpdated: [] }),
        (this._timeout = 0),
        (this._config = {
          sdk_version: "3.3.18",
          set pv_id(e) {
            b[m] = e;
          },
          get pv_id() {
            return (b[m] || (b[m] = u()), b[m]);
          },
          timezone_offset: new Date().getTimezoneOffset(),
        }),
        e && (this._config = p(this._config, e)));
    }
    y.prototype = {
      constructor: y,
      _sendAll: function () {
        if (
          (this._timeout && (clearTimeout(this._timeout), (this._timeout = 0)), this._queue.length)
        ) {
          var e,
            t = this._config.maxUrlLength || 3e4,
            n = this._getSendConfig();
          try {
            e = this._processData(this._queue, n);
          } catch (e) {}
          if (e && e.length < t) return ((this._queue = []), void this.send(e));
          for (var r, o = []; this._queue.length; ) {
            o.push(this._queue.shift());
            try {
              r = this._processData(o, n);
            } catch (e) {
              var i = o.pop();
              h(e.message, i);
              continue;
            }
            if (r.length > t) {
              o.length > 1 && (this._queue.unshift(o.pop()), (r = this._processData(o, n)));
              break;
            }
          }
          (r && this.send(r), this._queue.length && this._sendAll());
        }
      },
      _send: function (e, t) {
        var n = this;
        if (!1 === t) {
          var r;
          try {
            r = this._processData([e]);
          } catch (t) {
            h(t.message, e);
          }
          r && this.send(r);
        } else {
          this._queue.push(e);
          var o = this._config.mergeRequestInterval || 500;
          this._timeout ||
            (this._timeout = setTimeout(function () {
              n._sendAll();
            }, o));
        }
      },
      _getSendConfig: function () {
        var e = {},
          t = this._config;
        for (var n in t)
          "requiredFields" !== n &&
            "maxUrlLength" !== n &&
            "queueGlobalName" !== n &&
            "debug" !== n &&
            "excludeCrawlers" !== n &&
            "collectClientHints" !== n &&
            0 !== n.indexOf("plugin") &&
            "" !== t[n] &&
            null !== t[n] &&
            void 0 !== t[n] &&
            (e[n] = d(t[n]));
        return e;
      },
      _processData: function (e, t) {
        t = t || this._getSendConfig();
        var n = v(t);
        return (n +=
          "&msg=" +
          encodeURIComponent(
            e
              .map(function (e) {
                return v(e);
              })
              .join("|"),
          ));
      },
      setConfig: function (e, t) {
        var n = this,
          r = {};
        void 0 !== t ? (r[e] = t) : (r = e);
        var o = !(function e(t, n) {
            if (void 0 === t || void 0 === n) return !1;
            if (!l(t) || !l(n)) return !1;
            for (var r in t)
              if (l(t[r])) {
                if (!e(t[r], n[r])) return !1;
              } else if (t[r] !== n[r]) return !1;
            return !0;
          })(r, this._config),
          i = function () {
            if (o) {
              for (var e in r)
                l(r[e]) ? (n._config[e] = p(n._config[e] || {}, r[e])) : (n._config[e] = r[e]);
              n._execSubscribe("onConfigUpdated", [r, n._config]);
            }
          };
        this._reqQueue.length
          ? (i(),
            g(this._config) ||
              (this._reqQueue.forEach(function (e) {
                n._send.apply(n, e);
              }),
              (this._reqQueue = [])))
          : (o && this._sendAll(), i());
      },
      getConfig: function (e) {
        return e ? this._config[e] : this._config;
      },
      updatePVID: (function (e, t) {
        if ("function" != typeof e) throw new TypeError("Expected a function");
        t = "number" == typeof t && t >= 0 ? t : 100;
        var n = null;
        return function () {
          if (null === n) {
            var r = this,
              o = Array.prototype.slice.call(arguments);
            ((n = setTimeout(function () {
              n = null;
            }, t)),
              e.apply(r, o));
          }
        };
      })(function () {
        b[m] = u();
      }, 200),
      log: function (e) {
        var t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
        e &&
          ((t.ts = t.ts || new Date().getTime()),
          (t.type = e),
          this._print("log", e, t),
          (t = f(t)),
          g(this._config)
            ? this._reqQueue.length < 1e3 && this._reqQueue.push([t, n.combo])
            : this._send(t, n.combo));
      },
      before: function (e, t) {
        var n = this;
        return function () {
          var r = arguments,
            o = t.apply(n, r);
          o !== c &&
            (s(o)
              ? o.then(function (t) {
                  t !== c && e.apply(n, t || r);
                })
              : e.apply(n, o || r));
        };
      },
      after: function (e, t) {
        var n = this;
        return function () {
          var r = arguments;
          (e.apply(n, r), t.apply(n, r));
        };
      },
      use: function (e, t) {
        var n = this;
        return "[object Array]" === Object.prototype.toString.call(e)
          ? e.map(function (e) {
              if ("[object Array]" === Object.prototype.toString.call(e)) {
                var t = e[0],
                  r = e[1];
                return n._plugins[t] || (n._plugins[t] = new t(n, r));
              }
              return n._plugins[e] || (n._plugins[e] = new e(n));
            })
          : this._plugins[e] || (this._plugins[e] = new e(this, t));
      },
      _print: function () {
        this._config.debug &&
          "undefined" != typeof console &&
          console.log.apply(console, arguments);
      },
      onConfigUpdated: function (e) {
        this._subscribers.onConfigUpdated && this._subscribers.onConfigUpdated.push(e);
      },
      _execSubscribe: function (e, t) {
        this._subscribers[e] &&
          this._subscribers[e].forEach(function (e) {
            e.apply(this, t);
          });
      },
    };
    var _ = y,
      B = n(3),
      S = n.n(B),
      T = n(4),
      j = n(5),
      N = n.n(j);
    function w(e) {
      return (w =
        "function" == typeof Symbol && "symbol" == typeof Symbol.iterator
          ? function (e) {
              return typeof e;
            }
          : function (e) {
              return e &&
                "function" == typeof Symbol &&
                e.constructor === Symbol &&
                e !== Symbol.prototype
                ? "symbol"
                : typeof e;
            })(e);
    }
    function O(e, t) {
      var n = Object.keys(e);
      if (Object.getOwnPropertySymbols) {
        var r = Object.getOwnPropertySymbols(e);
        (t &&
          (r = r.filter(function (t) {
            return Object.getOwnPropertyDescriptor(e, t).enumerable;
          })),
          n.push.apply(n, r));
      }
      return n;
    }
    function V(e) {
      for (var t = 1; t < arguments.length; t++) {
        var n = null != arguments[t] ? arguments[t] : {};
        t % 2
          ? O(Object(n), !0).forEach(function (t) {
              A(e, t, n[t]);
            })
          : Object.getOwnPropertyDescriptors
            ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(n))
            : O(Object(n)).forEach(function (t) {
                Object.defineProperty(e, t, Object.getOwnPropertyDescriptor(n, t));
              });
      }
      return e;
    }
    function A(e, t, n) {
      return (
        (t = (function (e) {
          var t = (function (e, t) {
            if ("object" != w(e) || !e) return e;
            var n = e[Symbol.toPrimitive];
            if (void 0 !== n) {
              var r = n.call(e, t || "default");
              if ("object" != w(r)) return r;
              throw new TypeError("@@toPrimitive must return a primitive value.");
            }
            return ("string" === t ? String : Number)(e);
          })(e, "string");
          return "symbol" == w(t) ? t : t + "";
        })(t)) in e
          ? Object.defineProperty(e, t, {
              value: n,
              enumerable: !0,
              configurable: !0,
              writable: !0,
            })
          : (e[t] = n),
        e
      );
    }
    function D(e, t) {
      var n = ("undefined" != typeof Symbol && e[Symbol.iterator]) || e["@@iterator"];
      if (!n) {
        if (Array.isArray(e) || (n = P(e)) || (t && e && "number" == typeof e.length)) {
          n && (e = n);
          var r = 0,
            o = function () {};
          return {
            s: o,
            n: function () {
              return r >= e.length ? { done: !0 } : { done: !1, value: e[r++] };
            },
            e: function (e) {
              throw e;
            },
            f: o,
          };
        }
        throw new TypeError(
          "Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.",
        );
      }
      var i,
        a = !0,
        u = !1;
      return {
        s: function () {
          n = n.call(e);
        },
        n: function () {
          var e = n.next();
          return ((a = e.done), e);
        },
        e: function (e) {
          ((u = !0), (i = e));
        },
        f: function () {
          try {
            a || null == n.return || n.return();
          } finally {
            if (u) throw i;
          }
        },
      };
    }
    function k(e, t) {
      return (
        (function (e) {
          if (Array.isArray(e)) return e;
        })(e) ||
        (function (e, t) {
          var n =
            null == e
              ? null
              : ("undefined" != typeof Symbol && e[Symbol.iterator]) || e["@@iterator"];
          if (null != n) {
            var r,
              o,
              i,
              a,
              u = [],
              p = !0,
              l = !1;
            try {
              if (((i = (n = n.call(e)).next), 0 === t)) {
                if (Object(n) !== n) return;
                p = !1;
              } else
                for (; !(p = (r = i.call(n)).done) && (u.push(r.value), u.length !== t); p = !0);
            } catch (e) {
              ((l = !0), (o = e));
            } finally {
              try {
                if (!p && null != n.return && ((a = n.return()), Object(a) !== a)) return;
              } finally {
                if (l) throw o;
              }
            }
            return u;
          }
        })(e, t) ||
        P(e, t) ||
        (function () {
          throw new TypeError(
            "Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.",
          );
        })()
      );
    }
    function P(e, t) {
      if (e) {
        if ("string" == typeof e) return C(e, t);
        var n = {}.toString.call(e).slice(8, -1);
        return (
          "Object" === n && e.constructor && (n = e.constructor.name),
          "Map" === n || "Set" === n
            ? Array.from(e)
            : "Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)
              ? C(e, t)
              : void 0
        );
      }
    }
    function C(e, t) {
      (null == t || t > e.length) && (t = e.length);
      for (var n = 0, r = Array(t); n < t; n++) r[n] = e[n];
      return r;
    }
    function E() {
      for (
        var e = /(?:[0]{1,2}[:-]){5}[0]{1,2}/,
          t = o.a.networkInterfaces(),
          n = 0,
          r = Object.entries(t);
        n < r.length;
        n++
      ) {
        var i = k(r[n], 2),
          a = (i[0], i[1]);
        if (a) {
          var u,
            p = D(a);
          try {
            for (p.s(); !(u = p.n()).done; ) {
              var l = u.value;
              if (!1 === e.test(l.mac)) return l.mac;
            }
          } catch (e) {
            p.e(e);
          } finally {
            p.f();
          }
        }
      }
      return "00:00:00:00:00:00";
    }
    var x,
      M,
      q =
        ((x = process.version),
        {
          os: o.a.type(),
          os_version: o.a.release(),
          app_name: "node",
          app_version: x,
          device_id: N.a.createHash("md5").update(E()).digest("hex"),
          platform: "node",
        }),
      I = Object(T.promisify)(S.a.resolve);
    function H(e) {
      ((this._offlineQueue = []),
        (e.endpoint = e.endpoint || "gm.mmstat.com"),
        _.call(this, V(V({}, q), e)),
        (this._config.endpoint_url = "https://".concat(this._config.endpoint).concat("/aes.1.1")));
    }
    ((H.prototype = (((M = function () {}).prototype = _.prototype), new M())),
      (H.prototype.constructor = H),
      (H.prototype.send = function (e) {
        var t,
          n = this;
        return ((t = this._config.endpoint), I(t))
          .then(function (t) {
            return (
              n._offlineQueue.forEach(function (e) {
                n.send(e);
              }),
              (n._offlineQueue = []),
              n._print("send", e),
              a()(n._config.endpoint_url, {
                method: "POST",
                keepalive: true,
                body: JSON.stringify({ gokey: encodeURIComponent(e), gmkey: "EXP" }),
              }).catch(function (e) {
                console.warn("send fail", e);
              })
            );
          })
          .catch(function (t) {
            (n._offlineQueue.length > 500 && n._offlineQueue.shift(), n._offlineQueue.push(e));
          });
      }));
    t.default = H;
  },
]).default;
