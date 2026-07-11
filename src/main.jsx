import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { enforceEphemeralLogout } from "./lib/globalAuth";

// If the last login unchecked "Remember me" and the browser was closed
// since, wipe those tokens before the app reads them.
enforceEphemeralLogout();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
