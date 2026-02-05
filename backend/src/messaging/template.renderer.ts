export type TemplateVars = Record<string, string>;

export function renderTemplate(body: string, vars: TemplateVars): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}
