import createDOMPurify from 'dompurify';

export function twemojiParse(input: string): string {
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  let result = '';

  Array.from(input ?? '').forEach((char) => {
    if (emojiRegex.test(char)) {
      const codePoints = Array.from(char)
        .map((c) => c.codePointAt(0)?.toString(16))
        .filter(Boolean)
        .join('-');

      const imgUrl = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${codePoints}.svg`;

      result += `<img style="height: 1em; width: 1em; margin: 0 .05em 0 .1em; vertical-align: -.1em; display: inline-block;" src="${imgUrl}" alt="${char}"></img>`;
    } else result += char;
  });

  return createDOMPurify.sanitize(result);
}

export function twemojiParseWithLinks(
  input: string,
  elementClass?: string
): string {
  const urlRegex =
    /http(s)?:\/\/([a-z0-9.-]+){1,3}(:[0-9]+)?(\/[\w?%.\-_@&.=/]*)?/gm; // Updated to allow for proper URL parsing
  const handleRegex = /@([\w]+)/g; // Regex to match @handles
  const hashtagRegex = /#([\w]+)/g; // Regex to match #hashtags

  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  const linkRegex = new RegExp(
    `${urlRegex.source}|${handleRegex.source}|${hashtagRegex.source}`,
    'gm'
  );
  const processedText = input.replace(linkRegex, (token) => {
    const href = token.startsWith('@')
      ? `/@${token.slice(1)}`
      : token.startsWith('#')
      ? '#'
      : token;
    return `<a href="${href}" class="${
      elementClass ?? 'text-main-accent'
    }">${token}</a>`;
  });

  let result = '';
  Array.from(processedText ?? '').forEach((char) => {
    if (emojiRegex.test(char)) {
      const codePoints = Array.from(char)
        .map((c) => c.codePointAt(0)?.toString(16))
        .filter(Boolean)
        .join('-');

      const imgUrl = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${codePoints}.svg`;

      result += `<img style="height: 1em; width: 1em; margin: 0 .05em 0 .1em; vertical-align: -.1em; display: inline-block;" alt="${char}" src="${imgUrl}"></img>`;
    } else result += char;
  });

  return createDOMPurify.sanitize(result);
}
