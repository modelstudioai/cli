export type TextStyle = (text: string) => string;

export interface AnsiStyles {
  bold: TextStyle;
  dim: TextStyle;
  green: TextStyle;
  yellow: TextStyle;
  red: TextStyle;
  cyan: TextStyle;
  blue: TextStyle;
  magenta: TextStyle;
  white: TextStyle;
  accent: TextStyle;
  logo: TextStyle;
  purple: TextStyle;
  brandBlue: TextStyle;
  keyPink: TextStyle;
  reset: string;
}

const plain: TextStyle = (text) => text;

function wrap(enabled: boolean, code: string): TextStyle {
  return enabled ? (text) => `\x1b[${code}m${text}\x1b[0m` : plain;
}

export function isTerminal(out: NodeJS.WriteStream): boolean {
  return out.isTTY === true;
}

export function supportsColor(out: NodeJS.WriteStream): boolean {
  return !("NO_COLOR" in process.env) && isTerminal(out);
}

export function ansi(out: NodeJS.WriteStream): AnsiStyles {
  const enabled = supportsColor(out);
  return {
    bold: wrap(enabled, "1"),
    dim: wrap(enabled, "2"),
    green: wrap(enabled, "32"),
    yellow: wrap(enabled, "33"),
    red: wrap(enabled, "31"),
    cyan: wrap(enabled, "36"),
    blue: wrap(enabled, "34"),
    magenta: wrap(enabled, "35"),
    white: wrap(enabled, "37"),
    accent: wrap(enabled, "38;2;59;130;246"),
    logo: wrap(enabled, "38;2;97;92;237"),
    purple: wrap(enabled, "38;2;147;51;234"),
    brandBlue: wrap(enabled, "1;38;2;43;82;255"),
    keyPink: wrap(enabled, "38;2;236;72;153"),
    reset: enabled ? "\x1b[0m" : "",
  };
}
