# Quick Start - Documentation Site

## Running the Documentation Locally

### Option 1: Run on Port 3001 (Recommended)

The documentation site is configured to run on **port 3001** to avoid conflicts with your main app (which runs on port 3000).

1. **Navigate to the docs-site directory:**
   ```bash
   cd docs-site
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Visit: **http://localhost:3001**

### Option 2: Run on Port 3000

If your main app is not running, you can run the docs on port 3000:

1. Edit `docs-site/package.json`
2. Change the port in the scripts:
   ```json
   "dev": "next dev -p 3000",
   "start": "next start -p 3000",
   ```
3. Run: `npm run dev`
4. Visit: **http://localhost:3000**

## Building for Production

```bash
cd docs-site
npm run build
npm start
```

## Troubleshooting

- **Port already in use**: Make sure port 3001 (or 3000) is not in use by another process
- **Dependencies missing**: Run `npm install` in the docs-site directory
- **Build errors**: Check Node.js version (requires Node 18+)
