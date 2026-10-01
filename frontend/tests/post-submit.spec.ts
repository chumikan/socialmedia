import { test, expect } from '@playwright/test';

test.use({ locale: 'ja-JP' });

for (const width of [1440, 390]) {
  test(`sidebar composer can submit repeatedly without a 500 page (${width}px)`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.request.post('/api/v1/auth/register', {
      headers: { 'X-SNS-Request': '1' },
      data: {
        email: `composer${width}${Date.now()}@example.test`,
        password: 'browser-test-password'
      }
    });
    expect(response.ok()).toBeTruthy();
    await page.goto('/home');
    for (let index = 0; index < 2; index++) {
      const text = `sidebar post ${width} ${Date.now()} ${index}`;
      await page
        .locator('#sidebar')
        .getByRole('button', { name: 'Post', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByPlaceholder("What's happening?").fill(text);
      if (index === 1) {
        await dialog.locator('input[type="file"]').setInputFiles({
          name: 'pixel.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'base64'
          )
        });
      }
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/posts') &&
          response.request().method() === 'POST'
      );
      await dialog.getByRole('button', { name: 'Post', exact: true }).click();
      expect((await saved).ok()).toBeTruthy();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.locator('article').filter({ hasText: text })
      ).toBeVisible();
      await expect(page).toHaveURL('/home');
    }
    expect(errors).toEqual([]);
  });
}

test('sidebar composer and inline reply remain usable in Japanese', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.request.post('/api/v1/auth/register', {
    headers: { 'X-SNS-Request': '1' },
    data: {
      email: `homecomposer${Date.now()}@example.test`,
      password: 'browser-test-password'
    }
  });
  expect(response.ok()).toBeTruthy();
  const user: { username: string } = await response.json();
  await page.goto('/home');
  const text = `日本語の投稿 ${Date.now()}`;
  await expect(
    page.locator('main').getByPlaceholder("What's happening?")
  ).toHaveCount(0);
  await page
    .locator('#sidebar')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  const composer = page.getByRole('dialog');
  await composer.getByPlaceholder("What's happening?").fill(text);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/posts') &&
      response.request().method() === 'POST'
  );
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  const postResponse = await saved;
  expect(postResponse.ok()).toBeTruthy();
  const post: { id: string } = await postResponse.json();
  await expect(page.locator('article').filter({ hasText: text })).toBeVisible();
  await expect(page).toHaveURL('/home');
  await expect(composer).toHaveCount(0);
  await page.goto(`/@${user.username}/status/${post.id}`);
  await page.getByPlaceholder('Post your reply').fill('日本語の返信');
  await page.getByRole('button', { name: 'Reply', exact: true }).last().click();
  await expect(
    page.locator('article').filter({ hasText: '日本語の返信' })
  ).toBeVisible();
  await expect(page).toHaveURL(`/@${user.username}/status/${post.id}`);
  expect(errors).toEqual([]);
});
