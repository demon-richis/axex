function websiteUrl(path = '') {
  const configuredUrl = process.env.WEBSITE_URL?.trim();
  if (!configuredUrl) throw new Error('WEBSITE_URL is not configured');

  const normalizedUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(configuredUrl)
    ? configuredUrl
    : `https://${configuredUrl}`;
  const baseUrl = new URL(normalizedUrl);
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('WEBSITE_URL must use HTTP or HTTPS');
  }

  return new URL(path.replace(/^\/+/, ''), `${baseUrl.toString().replace(/\/+$/, '')}/`).toString();
}

module.exports = websiteUrl;