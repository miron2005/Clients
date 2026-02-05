"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTemplate = renderTemplate;
function renderTemplate(body, vars) {
    let out = body;
    for (const [k, v] of Object.entries(vars)) {
        out = out.replaceAll(`{${k}}`, v);
    }
    return out;
}
//# sourceMappingURL=template.renderer.js.map