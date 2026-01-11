# Pariflow Documentation Site

This is the documentation site for Pariflow, built with [Nextra](https://nextra.site).

## Development

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The documentation will be available at `http://localhost:3001`

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

## Project Structure

```
docs-site/
├── pages/              # Documentation pages (MDX format)
│   ├── _meta.json      # Navigation structure
│   ├── getting-started/
│   ├── guides/
│   ├── api/
│   ├── architecture/
│   └── admin/
├── theme.config.tsx     # Theme configuration
├── next.config.js       # Next.js configuration
└── package.json
```

## Adding New Documentation

1. Create a new `.mdx` file in the appropriate directory
2. Add frontmatter with title and description:
   ```mdx
   ---
   title: Page Title
   description: Page description
   ---
   ```
3. Update the `_meta.json` file in the parent directory to include the new page

## Deployment

This site is deployed to `docs.pariflow.com` via Vercel.

### Vercel Deployment

1. Connect the repository to Vercel
2. Set root directory to `docs-site/`
3. Configure custom domain: `docs.pariflow.com`
4. Deploy automatically on push to main branch

## Documentation Source

The source documentation files are in the parent `docs/` directory. This site serves as the presentation layer for that content.
