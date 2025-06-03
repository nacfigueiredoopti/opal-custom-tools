import cors from "cors";
import express from "express";
import basicAuth from "express-basic-auth";
import { ToolsService, tool } from "@optimizely-opal/opal-tools-sdk";

// Create Express app
const app = express();
app.use(express.json());
app.use(cors());

// Add basic authentication
app.use(basicAuth({
  users: { 'admin': 'password' },
  challenge: true
}));

// Create Tools Service
const toolsService = new ToolsService(app);

// Import tools
import "./tools/greeting";
import "./tools/todays-date";
import "./tools/api-call";
import "./tools/sqlite-query";

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Discovery endpoint: http://localhost:${PORT}/discovery`);
});
