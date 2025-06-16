# opal-custom-tools

A custom tools service for Optimizely Opal that exposes tools via HTTP endpoints using the `@optimizely-opal/opal-tools-sdk`.

## Getting Started

### Prerequisites
- Node.js
- Yarn 4.3.1

### Installation
```bash
yarn install
```

### Development
```bash
# Run in development mode with hot reload
yarn dev

# Build the project
yarn build

# Run the compiled application
yarn start
```

The server will start on port 3000 (or the PORT environment variable) and expose:
- Tools endpoints for each registered tool
- Discovery endpoint at `/discovery`

## Available Tools

### greeting
Greets a person in a random language (English, Spanish, French).

**Parameters:**
- `name` (required): Name of the person to greet
- `language` (optional): Language for greeting (defaults to random)

### todays-date
Returns today's date in the specified format.

**Parameters:**
- `format` (optional): Date format (defaults to ISO format)

### api_call
HTTP client wrapper supporting various HTTP methods with custom headers.

**Parameters:**
- `url` (required): The URL to make the request to
- `method` (optional): HTTP method (GET, POST, PUT, PATCH, DELETE). Defaults to GET
- `headers` (optional): Custom headers as JSON string
- `body` (optional): Request body (for POST, PUT, PATCH methods)

## Architecture

This service uses Express.js with CORS enabled to serve tools. Each tool is implemented as a separate module in the `src/tools/` directory and registered using the `@tool` decorator pattern from the Opal tools SDK.

### Project Structure
```
src/
  main.ts          # Main application entry point
  tools/           # Individual tool implementations
    greeting.ts
    todays-date.ts
    api-call.ts
```

### Adding New Tools

1. Create a new file in `src/tools/` directory
2. Define TypeScript interfaces for tool parameters
3. Implement async function with typed parameters
4. Register tool using `tool()` decorator with parameter definitions
5. Import the tool file in `src/main.ts`

## Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript (ES2022, NodeNext modules)
- **Framework**: Express.js
- **Package Manager**: Yarn 4.3.1
- **SDK**: @optimizely-opal/opal-tools-sdk
- **Development**: tsc-watch for hot reload

# GIPHY Reference
```sh
https://giphy.com/gifs/rick-astley-Ju7l5y9osyymQ
```