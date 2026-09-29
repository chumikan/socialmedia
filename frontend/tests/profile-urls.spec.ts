import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

const headers = { 'X-SNS-Request': '1' };

type Account = { id: string; username: string; name: string };

async function setup(page: Page, browser: Browser) {
  const suffix = `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const register = async (
    request: Page['request'],
    prefix: string
  ): Promise<Account> => {
    const response = await request.post('/api/v1/auth/register', {
      headers,
      data: {
        email: `${prefix}${suffix}@example.test`,
        password: 'browser-test-password'
      }
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const me = await register(page.request, 'viewer');
  const otherContext = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000'
  });
  try {
    const other = await register(otherContext.request, 'author');
    const text = `Hello @${me.username} https://example.test/@${me.username}`;
    const response = await otherContext.request.post('/api/v1/posts', {
      headers,
      data: { text, parentId: null, mediaIds: [] }
    });
    expect(response.ok()).toBeTruthy();
    const post: { id: string } = await response.json();
    const followed = await otherContext.request.put(
      `/api/v1/users/${me.id}/follow`,
      { headers }
    );
    expect(followed.ok()).toBeTruthy();
    return { me, other, post, text };
  } finally {
    await otherContext.close();
  }
}

test('profile routes, navigation, mentions and notifications use one @ prefix', async ({
  page,
  browser
}) => {
  const { me, other, post, text } = await setup(page, browser);
  const profile = `/@${other.username}`;
  await page.goto(profile);
  await expect(
    page.getByRole('button', { name: 'Follow', exact: true }).first()
  ).toBeVisible();
  for (const [name, suffix] of [
    ['Tweets & replies', 'with_replies'],
    ['Media', 'media'],
    ['Likes', 'likes'],
    ['Tweets', '']
  ]) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute(
      'href',
      `${profile}${suffix ? `/${suffix}` : ''}`
    );
    await link.click();
    await expect(page).toHaveURL(`${profile}${suffix ? `/${suffix}` : ''}`);
    await expect(
      page.getByRole('button', { name: 'Follow', exact: true }).first()
    ).toBeVisible();
  }
  await page
    .locator(`a[href="${profile}/followers"]`)
    .filter({ hasText: 'Follower' })
    .first()
    .click();
  await expect(page).toHaveURL(`${profile}/followers`);
  await page.getByRole('link', { name: 'Following', exact: true }).click();
  await expect(page).toHaveURL(`${profile}/following`);
  await expect(
    page.locator(`a[href="/@${me.username}"]`).first()
  ).toBeVisible();
  await page.getByRole('link', { name: 'Followers', exact: true }).click();
  await expect(page).toHaveURL(`${profile}/followers`);

  await page.goto(`${profile}/status/${post.id}`);
  const tweet = page.locator('article').filter({ hasText: text });
  const mention = tweet.getByRole('link', {
    name: `@${me.username}`,
    exact: true
  });
  await expect(mention).toHaveAttribute('href', `/@${me.username}`);
  await expect(
    tweet.getByRole('link', {
      name: `https://example.test/@${me.username}`,
      exact: true
    })
  ).toHaveAttribute('href', `https://example.test/@${me.username}`);
  await mention.click();
  await expect(page).toHaveURL(`/@${me.username}`);
  await expect(
    page.getByRole('button', { name: 'Edit profile', exact: true })
  ).toBeVisible();

  // Avatar and username links, including the hover card's follow links.
  await page.goto(`${profile}/status/${post.id}`);
  const avatar = page
    .locator('article')
    .locator(`a[href="${profile}"]`)
    .filter({ has: page.locator('img') })
    .first();
  await avatar.click();
  await expect(page).toHaveURL(profile);
  await page.goto(`${profile}/status/${post.id}`);
  const username = page
    .locator('article')
    .getByRole('link', { name: `@${other.username}`, exact: true })
    .first();
  await username.hover();
  const tooltip = username.locator('..').locator('.menu-container');
  await expect(tooltip).toBeVisible();
  await expect(
    tooltip.getByRole('link', { name: /Followers/ })
  ).toHaveAttribute('href', `${profile}/followers`);
  await tooltip
    .getByRole('link', { name: `@${other.username}`, exact: true })
    .click();
  await expect(page).toHaveURL(profile);
  await page.goto(`${profile}/status/${post.id}`);
  await page
    .locator('article')
    .getByRole('link', { name: `@${other.username}`, exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(profile);

  await page.goto('/notifications');
  const notification = page
    .getByRole('link')
    .filter({ hasText: 'A new user followed you' })
    .first();
  await expect(notification).toHaveAttribute('href', profile);
  await notification.click();
  await expect(page).toHaveURL(profile);
  await expect(page.locator('a[href*="/@@"]')).toHaveCount(0);
  const current: Account = await (
    await page.request.get('/api/v1/auth/me')
  ).json();
  expect(current.username).toBe(me.username);
  expect(current.username).not.toContain('@');
});

test('share URLs use the author and deleting a reply returns to its parent', async ({
  page,
  browser,
  context
}) => {
  const { me, other, post, text } = await setup(page, browser);
  const profile = `/@${other.username}`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(profile);
  await expect(
    page.getByRole('button', { name: 'Follow', exact: true }).first()
  ).toBeVisible();
  await page
    .locator('main button')
    .filter({ has: page.getByText('More', { exact: true }) })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Copy link to Profile', exact: true })
    .click();
  const profileURL = new URL(
    await page.evaluate(() => navigator.clipboard.readText())
  );
  expect(profileURL.pathname).toBe(profile);

  const card = page.locator('article').filter({ hasText: text });
  await expect(
    card.locator(`a[href="${profile}/status/${post.id}"]`).first()
  ).toBeVisible();
  await card
    .locator('button')
    .filter({ has: page.getByText('Share', { exact: true }) })
    .click();
  await page
    .getByRole('button', { name: 'Copy link to Tweet', exact: true })
    .click();
  expect(
    new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname
  ).toBe(`${profile}/status/${post.id}`);
  await card.locator(`a[href="${profile}/status/${post.id}"]`).first().click();
  await expect(page).toHaveURL(`${profile}/status/${post.id}`);
  await page
    .locator('article')
    .locator('button')
    .filter({ has: page.getByText('Share', { exact: true }) })
    .click();
  await page
    .getByRole('button', { name: 'Copy link to Tweet', exact: true })
    .click();
  expect(
    new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname
  ).toBe(`${profile}/status/${post.id}`);

  const response = await page.request.post('/api/v1/posts', {
    headers,
    data: { text: 'Reply to another author', parentId: post.id, mediaIds: [] }
  });
  expect(response.ok()).toBeTruthy();
  const reply: { id: string } = await response.json();
  await page.goto(`/@${me.username}/status/${reply.id}`);
  const replyCard = page
    .locator('article')
    .filter({ hasText: 'Reply to another author' });
  await expect(
    replyCard.getByRole('link', { name: `@${other.username}`, exact: true })
  ).toHaveAttribute('href', profile);
  await replyCard
    .locator('button')
    .filter({ has: page.getByText('More', { exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page).toHaveURL(`${profile}/status/${post.id}`);
  await expect(
    page.getByText('Your Tweet was deleted', { exact: true })
  ).toBeVisible();
});

test('unprefixed profile URLs are rejected and fixed routes still work', async ({
  page,
  browser
}) => {
  const { other, post } = await setup(page, browser);
  for (const suffix of [
    '',
    '/followers',
    '/following',
    '/likes',
    '/media',
    '/with_replies',
    `/status/${post.id}`
  ]) {
    const path = `/${other.username}${suffix}`;
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    expect(response?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole('heading', { name: 'Nothing to see here' })
    ).toBeVisible();
  }
  for (const path of [
    `/@@${other.username}`,
    `/@@${other.username}/status/${post.id}`
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(path);
  }
  for (const path of [
    '/home',
    '/explore',
    '/notifications',
    '/bookmarks',
    '/search?q=hello'
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Nothing to see here' })
    ).toHaveCount(0);
  }
});
