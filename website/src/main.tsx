import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Tutorial from "./pages/Tutorial";
import Playground from "./pages/Playground";
import "./index.css";

// Docs pages
import DocsIndex from "./pages/docs/index";
import QuickStart from "./pages/docs/quickstart";
import EntitiesDocs from "./pages/docs/entities";
import RelationsDocs from "./pages/docs/relations";
import RulesDocs from "./pages/docs/rules";
import AccessDocs from "./pages/docs/access";
import ActionsDocs from "./pages/docs/actions";
import ViewsDocs from "./pages/docs/views";
import HooksDocs from "./pages/docs/hooks";
import WebhooksDocs from "./pages/docs/webhooks";
import MessagesDocs from "./pages/docs/messages";
import PresenceDocs from "./pages/docs/presence";
import EphemeralDocs from "./pages/docs/ephemeral";
import TestingDocs from "./pages/docs/testing";
import CLIDocs from "./pages/docs/cli";
import DevModeDocs from "./pages/docs/dev-mode";
import MigrationsDocs from "./pages/docs/migrations";
import ExtendingDocs from "./pages/docs/extending";
import ArchitectureDocs from "./pages/docs/architecture";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/playground" element={<Playground />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/docs" element={<DocsIndex />} />
        <Route path="/docs/quickstart" element={<QuickStart />} />
        <Route path="/docs/entities" element={<EntitiesDocs />} />
        <Route path="/docs/relations" element={<RelationsDocs />} />
        <Route path="/docs/rules" element={<RulesDocs />} />
        <Route path="/docs/access" element={<AccessDocs />} />
        <Route path="/docs/actions" element={<ActionsDocs />} />
        <Route path="/docs/views" element={<ViewsDocs />} />
        <Route path="/docs/hooks" element={<HooksDocs />} />
        <Route path="/docs/webhooks" element={<WebhooksDocs />} />
        <Route path="/docs/messages" element={<MessagesDocs />} />
        <Route path="/docs/presence" element={<PresenceDocs />} />
        <Route path="/docs/ephemeral" element={<EphemeralDocs />} />
        <Route path="/docs/testing" element={<TestingDocs />} />
        <Route path="/docs/cli" element={<CLIDocs />} />
        <Route path="/docs/dev-mode" element={<DevModeDocs />} />
        <Route path="/docs/migrations" element={<MigrationsDocs />} />
        <Route path="/docs/extending" element={<ExtendingDocs />} />
        <Route path="/docs/architecture" element={<ArchitectureDocs />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
