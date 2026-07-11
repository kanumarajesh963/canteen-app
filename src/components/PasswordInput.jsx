import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// A password field with a show/hide eye toggle, styled like the app's inputs.
export default function PasswordInput({ value, onChange, placeholder = "Enter password", required, autoFocus, className = "", icon: Icon }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${className}`}>
      {Icon && <Icon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />}
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className={`w-full py-2.5 pr-11 rounded-xl border border-ink/15 focus:border-turmeric outline-none bg-surface ${Icon ? "pl-10" : "pl-4"}`}
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
