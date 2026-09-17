export function elide(i: number, str: string): string {

  // Take into account that ' ... ' extends the string
  if (str.length < 2 * i + 5)
    return str;

  return str.substring(0, i) + ' ... ' + str.substring(str.length - i)
}
