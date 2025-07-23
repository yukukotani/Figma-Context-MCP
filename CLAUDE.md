# Figma MCP Server - Architecture & Conventions

## Project Overview
TypeScript-based MCP server that bridges Figma design data with AI coding assistants (Claude, Cursor, etc.). Converts raw Figma API responses into simplified, structured data for accurate code generation.

## Architecture
```
Client (Cursor/Claude) → MCP Server → Figma Service → Figma API
                                  ↓
                            Extractors/Transformers → Simplified Design Data
```

## Key Components

### Core Server (`src/mcp/index.ts`)
- MCP protocol implementation using `@modelcontextprotocol/sdk`
- Tool registration system
- Configuration-based feature flags

### Dual Transport Support (`src/cli.ts`, `src/server.ts`)
- **STDIO Mode**: Standard MCP client communication (default)
- **HTTP Mode**: REST + SSE for web clients
- Mode detection: `NODE_ENV=cli` or `--stdio` flag

### Figma Service (`src/services/figma.ts`)
- Figma REST API abstraction
- Auth handling (Personal Token + OAuth)
- Image processing pipeline
- Error handling with retry logic

### Data Processing Pipeline
1. **Raw API Response** → Figma Service
2. **Node Traversal** → `src/extractors/node-walker.ts`
3. **Data Extraction** → Modular extractors in `src/extractors/built-in.ts`
4. **Transformation** → `src/transformers/` (layout, text, effects, etc.)
5. **Output Formatting** → YAML/JSON for client

## MCP Tools

### Current Tools (`src/mcp/tools/`)
- `get_figma_data`: Core design data retrieval
- `download_figma_images`: Asset processing and download
- `hello_world`: Example/test tool

Tool structure: `{ name, description, parameters, handler }`

## Code Conventions

### File Structure
- `src/` - All TypeScript source
- `dist/` - Built output
- `.js` extensions in imports (ES modules)
- Absolute imports with `~` alias for `src/`

### Key Patterns
- **Extractor System**: Pluggable, composable data extraction
- **Service Layer**: Clean API abstractions
- **Type Safety**: Strong TypeScript throughout
- **Error Boundaries**: Graceful failure handling

### Configuration
- Environment: `.env` file + CLI args
- Auth: `FIGMA_API_KEY` or `FIGMA_OAUTH_TOKEN`
- Mode: `NODE_ENV=cli` for STDIO, HTTP otherwise

## Development Workflow

### Build & Dev
- `pnpm build` - Production build
- `pnpm dev` - Watch mode
- `pnpm type-check` - TypeScript validation
- `pnpm lint` - ESLint

### Testing
- `pnpm test` - Jest test suite
- `src/tests/` - Integration and benchmark tests

## Important Files to Know

### Entry Points
- `src/cli.ts` - Server startup logic
- `src/index.ts` - Public API exports

### Core Logic
- `src/mcp/index.ts` - MCP server setup
- `src/services/figma.ts` - Figma API client
- `src/extractors/` - Data processing engine

### Utilities
- `src/utils/logger.ts` - Structured logging
- `src/config.ts` - Configuration management

## Design Philosophy
- **Minimal Context**: Extract only relevant design data to reduce AI context size
- **Flexible Extraction**: Mix-and-match extractors for different use cases
- **Developer Experience**: Clear errors, good logging, fast iteration
- **Performance**: Concurrent operations, efficient image processing