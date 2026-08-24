/**
 * CSS Modules for the browser half: the bundler (tsdown client preset) inlines
 * `*.module.css` imports as hashed class maps, this declaration gives the
 * import its type in the browser-only project.
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
