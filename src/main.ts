import { ToolsService } from "@optimizely-opal/opal-tools-sdk";
import cors from "cors";
import express from "express";
import basicAuth from "express-basic-auth";

// Create Express app
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Add basic authentication
app.use(basicAuth({
  users: { 'admin': 'password' },
  challenge: true
}));

// Create Tools Service
const toolsService = new ToolsService(app);

// Import tools
import "./tools/api-call";
import "./tools/greeting";
import "./tools/rick-roll";
import "./tools/sqlite-query";
import "./tools/todays-date";

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Discovery endpoint: http://localhost:${PORT}/discovery`);
});
