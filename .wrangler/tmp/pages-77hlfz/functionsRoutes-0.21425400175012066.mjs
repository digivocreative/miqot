import { onRequestOptions as __api_ai_copy_ts_onRequestOptions } from "/Users/bagas/alhijaz/functions/api/ai-copy.ts"
import { onRequestPost as __api_ai_copy_ts_onRequestPost } from "/Users/bagas/alhijaz/functions/api/ai-copy.ts"
import { onRequestOptions as __api___path___js_onRequestOptions } from "/Users/bagas/alhijaz/functions/api/[[path]].js"
import { onRequest as __api___path___js_onRequest } from "/Users/bagas/alhijaz/functions/api/[[path]].js"
import { onRequest as __brosur___path___ts_onRequest } from "/Users/bagas/alhijaz/functions/brosur/[[path]].ts"
import { onRequest as __itinerary___path___ts_onRequest } from "/Users/bagas/alhijaz/functions/itinerary/[[path]].ts"
import { onRequestOptions as __brosur_js_onRequestOptions } from "/Users/bagas/alhijaz/functions/brosur.js"
import { onRequest as __brosur_js_onRequest } from "/Users/bagas/alhijaz/functions/brosur.js"
import { onRequest as ___middleware_ts_onRequest } from "/Users/bagas/alhijaz/functions/_middleware.ts"

export const routes = [
    {
      routePath: "/api/ai-copy",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_ai_copy_ts_onRequestOptions],
    },
  {
      routePath: "/api/ai-copy",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_ai_copy_ts_onRequestPost],
    },
  {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api___path___js_onRequestOptions],
    },
  {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___path___js_onRequest],
    },
  {
      routePath: "/brosur/:path*",
      mountPath: "/brosur",
      method: "",
      middlewares: [],
      modules: [__brosur___path___ts_onRequest],
    },
  {
      routePath: "/itinerary/:path*",
      mountPath: "/itinerary",
      method: "",
      middlewares: [],
      modules: [__itinerary___path___ts_onRequest],
    },
  {
      routePath: "/brosur",
      mountPath: "/",
      method: "OPTIONS",
      middlewares: [],
      modules: [__brosur_js_onRequestOptions],
    },
  {
      routePath: "/brosur",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__brosur_js_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_ts_onRequest],
      modules: [],
    },
  ]