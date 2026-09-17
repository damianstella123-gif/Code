import{c as l,r as i,s as f}from"./index-p6tNGCc1.js";/**
 * @license lucide-react v0.446.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=l("Star",[["polygon",{points:"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2",key:"8f66p6"}]]),p=3600;function a(e){try{const t=new URL(e).pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);if(t){const n=t[1];if(["company-logos","supplier-logos","supplier-photos"].includes(n))return{bucket:n,path:decodeURIComponent(t[2].split("?")[0])}}}catch{}return null}const r=new Map;function m(e){const[u,t]=i.useState(()=>{if(!e)return null;const n=r.get(e);return n&&n.expires>Date.now()?n.url:a(e)?null:e});return i.useEffect(()=>{if(!e){t(null);return}const n=r.get(e);if(n&&n.expires>Date.now()){t(n.url);return}const s=a(e);if(!s){t(e);return}let o=!1;return f.storage.from(s.bucket).createSignedUrl(s.path,p).then(({data:c})=>{o||(c!=null&&c.signedUrl?(r.set(e,{url:c.signedUrl,expires:Date.now()+(p-60)*1e3}),t(c.signedUrl)):t(e))}),()=>{o=!0}},[e]),u}export{h as S,m as u};
