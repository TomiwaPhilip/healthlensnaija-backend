const React = require("react");
const { useState } = require("react");

const FineTuneUpload = () => {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/fine-tune/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      setMessage(result.message || "File uploaded successfully!");
    } catch (error) {
      setMessage("Error uploading file.");
    }
  };

  return React.createElement(
    "div",
    null,
    React.createElement("h2", null, "Upload Fine-Tuning Data"),
    React.createElement("input", { type: "file", onChange: handleFileChange }),
    React.createElement("button", { onClick: handleUpload }, "Upload"),
    message && React.createElement("p", null, message)
  );
};

module.exports = FineTuneUpload;
