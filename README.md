# Bare Recipe

A focused recipe utility for saving recipes in a clean, structured form and turning them into practical grocery lists without the clutter of a conventional recipe website.

## What it does

- Save recipes with ingredients, instructions, servings, prep time, and cook time.
- Browse a personal recipe collection.
- Build and manage a grocery list from saved recipe data.
- Keep recipe state synchronized through a small client/server API rather than burying the product in a large application framework.

The product is intentionally narrow: preserve the useful parts of a recipe and make them easier to cook and shop from.

## Stack

- React 19
- TypeScript
- Vite
- React Router
- Zustand
- Tailwind CSS
- Cloudflare Workers
- Bun

## Local development

Requires Bun.

```sh
bun install
bun run dev
```

Other useful commands:

```sh
bun run build
bun test
bun run preview
bun run deploy
```

## Project structure

```text
src/client/   React application, pages, state, and API client
src/server/   server-side / Worker logic
src/shared/   shared types and domain code
public/       static assets
```

## Status

Active personal-product project. The codebase favors a small, direct workflow over adding social features, content feeds, or other recipe-platform complexity.
