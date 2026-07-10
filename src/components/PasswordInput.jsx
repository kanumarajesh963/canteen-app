import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// A password field with a show/hide eye toggle, styled like the app's inputs.
export default function PasswordInput({ value, onChange, placeholder = "Enter password", required, autoFocus, className = "" }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className="w-full px-4 py-2.5 pr-11 rounded-xl border border-ink/15 focus:border-turmeric outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-steel hover:text-ink p-1"
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
