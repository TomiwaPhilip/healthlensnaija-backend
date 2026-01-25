const React = require("react");
const { useState, useEffect } = require("react");
const axios = require("axios");

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Function to fetch report data with optional date filtering and pagination
  const fetchReports = async (start, end, page = 1) => {
    try {
      setTableLoading(true);
      const response = await axios.get("/api/reports", {
        params: { startDate: start, endDate: end, page },
      });
      setReports(response.data.reports);
      setTotalPages(response.data.totalPages);
      setCurrentPage(response.data.currentPage);
    } catch (err) {
      const errMsg =
        (err.response && err.response.data && err.response.data.message) ||
        err.message ||
        "Error fetching reports";
      setError(errMsg);
    } finally {
      setTableLoading(false);
      setLoading(false);
    }
  };

  // Initial fetch of reports without filtering
  useEffect(() => {
    fetchReports();
  }, []);

  // Export CSV function to download current reports as CSV
  const exportCSV = () => {
    if (reports.length === 0) return;
    const headers = ["ID", "Title", "Date", "Description"];
    const rows = reports.map((report) => {
      return `${report._id},${report.title},${new Date(report.date).toLocaleString()},${report.description}`;
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", "reports.csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return React.createElement("div", { style: styles.loading }, "Loading reports...");
  }

  if (error) {
    return React.createElement("div", { style: { color: "red" } }, "Error: ", error);
  }

  return React.createElement(
    "div",
    { style: styles.container },
    // Header Section with title, subtitle, and filter/export buttons
    React.createElement(
      "div",
      { style: styles.header },
      React.createElement("h1", { style: styles.title }, "Reports Page"),
      React.createElement("p", { style: styles.subtitle }, "View detailed reports and analytics."),
      // Date Range Filter Inputs and Filter Button
      React.createElement(
        "div",
        { style: { marginBottom: "20px" } },
        React.createElement("input", {
          type: "date",
          onChange: (e) => setStartDate(e.target.value),
          style: { marginRight: "10px", padding: "4px" },
          placeholder: "Start Date",
        }),
        React.createElement("input", {
          type: "date",
          onChange: (e) => setEndDate(e.target.value),
          style: { marginRight: "10px", padding: "4px" },
          placeholder: "End Date",
        }),
        React.createElement(
          "button",
          {
            onClick: () => fetchReports(startDate, endDate, 1), // Reset to page 1 when filtering
            style: { marginRight: "10px", padding: "8px 16px", cursor: "pointer" },
          },
          "Filter Dates"
        ),
        // Export CSV Button
        React.createElement(
          "button",
          {
            onClick: exportCSV,
            style: { padding: "8px 16px", cursor: "pointer" },
          },
          "Export CSV"
        )
      )
    ),
    // Table Section: Recent Reports
    React.createElement(
      "div",
      null,
      tableLoading
        ? React.createElement("p", { style: { textAlign: "center" } }, "Loading table data...")
        : React.createElement(
            "table",
            { style: { width: "100%", borderCollapse: "collapse", marginBottom: "32px" } },
            React.createElement(
              "thead",
              null,
              React.createElement(
                "tr",
                null,
                React.createElement("th", { style: { border: "1px solid #ddd", padding: "8px" } }, "ID"),
                React.createElement("th", { style: { border: "1px solid #ddd", padding: "8px" } }, "Title"),
                React.createElement("th", { style: { border: "1px solid #ddd", padding: "8px" } }, "Date"),
                React.createElement("th", { style: { border: "1px solid #ddd", padding: "8px" } }, "Description")
              )
            ),
            React.createElement(
              "tbody",
              null,
              reports.map((report) =>
                React.createElement(
                  "tr",
                  { key: report._id },
                  React.createElement("td", { style: { border: "1px solid #ddd", padding: "8px" } }, report._id),
                  React.createElement("td", { style: { border: "1px solid #ddd", padding: "8px" } }, report.title),
                  React.createElement("td", { style: { border: "1px solid #ddd", padding: "8px" } }, new Date(report.date).toLocaleString()),
                  React.createElement("td", { style: { border: "1px solid #ddd", padding: "8px" } }, report.description)
                )
              )
            )
          )
    ),
    // Pagination Controls
    React.createElement(
      "div",
      { style: { textAlign: "center", marginTop: "20px" } },
      React.createElement(
        "button",
        {
          onClick: () => {
            if (currentPage > 1) {
              setCurrentPage(currentPage - 1);
              fetchReports(startDate, endDate, currentPage - 1);
            }
          },
          disabled: currentPage === 1,
          style: { marginRight: "10px", padding: "8px 16px", cursor: "pointer" },
        },
        "Previous"
      ),
      React.createElement(
        "span",
        { style: { margin: "0 10px" } },
        `Page ${currentPage} of ${totalPages}`
      ),
      React.createElement(
        "button",
        {
          onClick: () => {
            if (currentPage < totalPages) {
              setCurrentPage(currentPage + 1);
              fetchReports(startDate, endDate, currentPage + 1);
            }
          },
          disabled: currentPage === totalPages,
          style: { padding: "8px 16px", cursor: "pointer" },
        },
        "Next"
      )
    )
  );
};

const styles = {
  container: {
    padding: "24px",
    fontFamily: "'Inter', sans-serif",
    backgroundColor: "#F8FAFC",
    minHeight: "100vh",
  },
  header: {
    marginBottom: "32px",
    textAlign: "center",
  },
  title: {
    color: "#1D4ED8",
    fontSize: "2.5rem",
    margin: "0 0 8px 0",
    fontWeight: "700",
  },
  subtitle: {
    color: "#64748B",
    fontSize: "1.1rem",
    margin: "0 0 20px 0",
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    fontSize: "1.5rem",
    color: "#64748B",
  },
};

module.exports = Reports;