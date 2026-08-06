# BookLingua Blog / Guides

The BookLingua guides section lives at `/blog` and is built from MDX files.

## How to Add a New Post

1. Create a new `.mdx` file in `content/blog/`
2. Name it using kebab-case, e.g. `how-to-format-your-docx.mdx`
3. Add frontmatter at the top
4. Write the content in Markdown
5. Run `npm run build` to make sure it compiles
6. Push to `main` — Vercel will auto-deploy

## Frontmatter Fields

```yaml
---
title: "Your Post Title"
description: "A short description for SEO and listing cards."
date: "2026-08-06"
author: "BookLingua"
category: "blog"        # or "guide"
tags: ["translation", "KDP"]
keywords: ["keyword one", "keyword two"]
image: "/og-image.png"   # optional
youtube: "VIDEO_ID"     # optional
---
```

## Embedding YouTube Videos

Use the `YouTube` component anywhere in the post body:

```mdx
<YouTube id="YOUR_VIDEO_ID" />
```

## Example Post

See `content/blog/prepare-manuscript-for-translation.mdx` for a working example.
