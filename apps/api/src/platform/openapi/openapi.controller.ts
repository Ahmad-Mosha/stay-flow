import { Controller, Get, Header } from '@nestjs/common';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi-document.js';

// An exact version with its hash, so the CDN can only ever serve the file reviewed here.
const SCALAR_SCRIPT =
  'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.1/dist/browser/standalone.js';
const SCALAR_INTEGRITY = 'sha384-kYDGzV91Jnn3TbHINV3nt54riK2uMJDfN5Al8dAkz4FssELTBWbD8rgw32sTKfOi';

// A plain reference: Scalar's AI chat, MCP offer and hosting tools are switched off.
const REFERENCE_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stay Flow API</title>
  </head>
  <body>
    <div id="reference"></div>
    <script src="${SCALAR_SCRIPT}" integrity="${SCALAR_INTEGRITY}" crossorigin="anonymous"></script>
    <script>
      Scalar.createApiReference('#reference', {
        url: 'openapi.json',
        agent: { disabled: true },
        mcp: { disabled: true },
        showDeveloperTools: 'never',
      });
    </script>
  </body>
</html>
`;

/** Publishes the API's own description: the OpenAPI document, and a reference page to read it. */
@Controller()
export class OpenApiController {
  // Built at startup, so a schema the document cannot describe stops the API from starting.
  private readonly document = buildOpenApiDocument();

  @Get('openapi.json')
  openApi(): OpenApiDocument {
    return this.document;
  }

  @Get('docs')
  @Header('Content-Type', 'text/html; charset=utf-8')
  reference(): string {
    return REFERENCE_PAGE;
  }
}
