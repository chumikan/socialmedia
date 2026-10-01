import { test, expect } from '@playwright/test';

test('register, publish, follow, interact, reply, profile, notifications', async ({
  page,
  browser
}) => {
  const suffix = Date.now().toString();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Sign up with email', exact: true })
    .click();
  await page
    .getByPlaceholder('Email', { exact: true })
    .fill(`ui${suffix}@example.test`);
  await page
    .getByPlaceholder('Password (12+ characters)', { exact: true })
    .fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  await page
    .getByPlaceholder("What's happening?")
    .fill(`browser post ${suffix}`);
  await page.getByRole('button', { name: 'Post', exact: true }).last().click();
  await expect(
    page.getByText(`browser post ${suffix}`, { exact: true })
  ).toBeVisible();
  const headers = { 'X-SNS-Request': '1' };
  const second = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000'
  });
  const other = await (
    await second.request.post('/api/v1/auth/register', {
      headers,
      data: {
        email: `other${suffix}@example.test`,
        password: 'browser-test-password'
      }
    })
  ).json();
  await second.request.post('/api/v1/posts', {
    headers,
    data: { text: `followed post ${suffix}`, parentId: null, mediaIds: [] }
  });
  await page.goto(`/@${other.username}`);
  const followed = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/users/${other.id}/follow`) &&
      response.request().method() === 'PUT'
  );
  await page
    .getByRole('button', { name: 'Follow', exact: true })
    .first()
    .click();
  expect((await followed).ok()).toBeTruthy();
  await page.goto('/home');
  await expect(
    page.getByText(`followed post ${suffix}`, { exact: true })
  ).toBeVisible();
  // Verify mutations from the same browser session, then confirm the preserved views.
  const posts = await (
    await page.request.post('/api/v1/query', {
      headers,
      data: {
        collection: 'posts',
        constraints: [
          { kind: 'where', field: 'createdBy', op: '==', value: other.id }
        ],
        limit: 10
      }
    })
  ).json();
  const post = posts.items[0];
  const card = page
    .locator('article')
    .filter({ hasText: `followed post ${suffix}` });
  await card.getByRole('button', { name: 'Like', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Unlike', exact: true })
  ).toBeVisible();
  const reposted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/posts/${post.id}/repost`) &&
      response.request().method() === 'PUT'
  );
  await card.getByRole('button', { name: 'Repost', exact: true }).click();
  expect((await reposted).ok()).toBeTruthy();
  await expect(page.getByRole('link', { name: 'Bookmarks', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Bookmark', exact: true })).toHaveCount(0);
  await page.goto(`/@${other.username}/status/${post.id}`);
  await page.getByPlaceholder('Post your reply').fill(`reply ${suffix}`);
  await page.getByRole('button', { name: 'Reply', exact: true }).last().click();
  await expect(
    page.getByText(`reply ${suffix}`, { exact: true })
  ).toBeVisible();
  await page.goto(`/@${me.username}`);
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(`UI Person ${suffix}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(`UI Person ${suffix}`, { exact: true }).first()
  ).toBeVisible();
  const otherPage = await second.newPage();
  await otherPage.goto('/notifications');
  await expect(
    otherPage.getByText('A new user followed you', { exact: true }).first()
  ).toBeVisible();
  expect(errors).toEqual([]);
  await second.close();
});

test('upload media through S3 and display it on a post', async ({ page }) => {
  const headers = { 'X-SNS-Request': '1' };
  await page.request.post('/api/v1/auth/register', {
    headers,
    data: {
      email: `media${Date.now()}@example.test`,
      password: 'browser-test-password'
    }
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  );
  const response = await page.request.post('/api/v1/media', {
    headers,
    multipart: {
      file: { name: 'pixel.png', mimeType: 'image/png', buffer: png }
    }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const media = await response.json();
  const postResponse = await page.request.post('/api/v1/posts', {
    headers,
    data: { text: 'Media integration', parentId: null, mediaIds: [media.id] }
  });
  expect(postResponse.ok()).toBeTruthy();
  await page.goto('/home');
  await expect(
    page.getByText('Media integration', { exact: true })
  ).toBeVisible();
  const image = page.locator(`img[src="${media.src}"]`).first();
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const downloaded = await page.request.get(media.src);
  expect(downloaded.headers()['content-type']).toBe('image/png');
  expect(await downloaded.body()).toEqual(png);
});
