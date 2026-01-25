// const React = require("react");
// const { useState, useEffect } = require("react");
// const { Line, Bar, Pie } = require("react-chartjs-2");
// const Chart = require("chart.js/auto");
// const axios = require("axios");

// const Dashboard = () => {
//   const [stats, setStats] = useState({
//     totalUsers: 0,
//     activeUsers: 0,
//     totalStories: 0,
//     avgEngagement: 0,
//   });
//   const [loading, setLoading] = useState(true);
//   const [startDate, setStartDate] = useState("");
//   const [endDate, setEndDate] = useState("");
//   const [tableData, setTableData] = useState([]);
//   const [tableLoading, setTableLoading] = useState(false);

//   // Function to fetch dashboard statistics from the backend
//   const fetchStats = async () => {
//     try {
//       const response = await axios.get("/api/stats");
//       setStats(response.data);
//     } catch (error) {
//       console.error("Error fetching stats:", error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Function to fetch recent stories (table data) from the backend and filter by date if provided
//   const fetchTableData = async (start, end) => {
//     try {
//       setTableLoading(true);
//       const response = await axios.get("/api/stories");
//       let data = response.data; // Expecting an array of story objects
//       if (start && end) {
//         const startTimestamp = new Date(start).getTime();
//         const endTimestamp = new Date(end).getTime();
//         data = data.filter((story) => {
//           const createdTime = new Date(story.createdAt).getTime();
//           return createdTime >= startTimestamp && createdTime <= endTimestamp;
//         });
//       }
//       setTableData(data);
//     } catch (err) {
//       console.error("Error fetching table data:", err);
//     } finally {
//       setTableLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchStats();
//     fetchTableData();
//   }, []);

//   if (loading) {
//     return React.createElement(
//       "div",
//       { style: styles.loading },
//       "Loading..."
//     );
//   }

//   return React.createElement(
//     "div",
//     { style: styles.container },
//     // Header Section with title, subtitle, date filter, and feature buttons
//     React.createElement(
//       "div",
//       { style: styles.header },
//       React.createElement("h1", { style: styles.title }, "Admin Dashboard"),
//       React.createElement("p", { style: styles.subtitle }, "Analytics & Insights Overview"),
//       // Date Range Filter Inputs and Filter Button
//       React.createElement(
//         "div",
//         { style: { margin: "10px" } },
//         React.createElement("input", {
//           type: "date",
//           onChange: (e) => setStartDate(e.target.value),
//           style: { marginRight: "8px", padding: "4px" },
//           placeholder: "Start Date"
//         }),
//         React.createElement("input", {
//           type: "date",
//           onChange: (e) => setEndDate(e.target.value),
//           style: { marginRight: "8px", padding: "4px" },
//           placeholder: "End Date"
//         }),
//         React.createElement(
//           "button",
//           {
//             style: { margin: "10px", padding: "8px 16px", cursor: "pointer" },
//             onClick: () => fetchTableData(startDate, endDate)
//           },
//           "Filter Dates"
//         )
//       ),
//       // Refresh Stats Button
//       React.createElement(
//         "button",
//         {
//           style: { margin: "10px", padding: "8px 16px", cursor: "pointer" },
//           onClick: () => {
//             setLoading(true);
//             fetchStats();
//           },
//         },
//         "Refresh Stats"
//       ),
//       // Download Stats Button (exports stats as CSV)
//       React.createElement(
//         "button",
//         {
//           style: { margin: "10px", padding: "8px 16px", cursor: "pointer" },
//           onClick: () => {
//             const csvRows = [
//               "Metric,Value",
//               `Total Users,${stats.totalUsers}`,
//               `Active Users,${stats.activeUsers}`,
//               `Total Stories,${stats.totalStories}`,
//               `Avg. Engagement,${stats.avgEngagement}`,
//             ];
//             const csvData = csvRows.join("\n");
//             const blob = new Blob([csvData], { type: "text/csv" });
//             const url = window.URL.createObjectURL(blob);
//             const a = document.createElement("a");
//             a.setAttribute("hidden", "");
//             a.setAttribute("href", url);
//             a.setAttribute("download", "dashboard_stats.csv");
//             document.body.appendChild(a);
//             a.click();
//             document.body.removeChild(a);
//           },
//         },
//         "Download Stats"
//       )
//     ),

//     // Stats Cards Grid
//     React.createElement(
//       "div",
//       { style: styles.grid },
//       createStatCard("Total Users", stats.totalUsers, "#1D4ED8"),
//       createStatCard("Active Users", stats.activeUsers, "#2563EB"),
//       createStatCard("Stories Created", stats.totalStories, "#3B82F6"),
//       createStatCard("Avg. Engagement", `${stats.avgEngagement}%`, "#93C5FD")
//     ),

//     // Charts Section: User Growth and Demographics
//     React.createElement(
//       "div",
//       { style: styles.chartGrid },
//       React.createElement(
//         "div",
//         { style: styles.chartCard },
//         React.createElement("h3", { style: styles.chartTitle }, "User Growth Trend"),
//         React.createElement(Line, {
//           data: {
//             labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
//             datasets: [
//               {
//                 label: "User Growth",
//                 data: [65, 59, 80, 81, 56, 55],
//                 borderColor: "#1D4ED8",
//                 backgroundColor: "rgba(29, 78, 216, 0.2)",
//                 tension: 0.4,
//               },
//             ],
//           },
//           options: {
//             responsive: true,
//             plugins: {
//               legend: { position: "bottom" },
//             },
//           },
//         })
//       ),
//       React.createElement(
//         "div",
//         { style: styles.chartCard },
//         React.createElement("h3", { style: styles.chartTitle }, "User Demographics"),
//         React.createElement(Pie, {
//           data: {
//             labels: ["Standard Users", "OAuth Users"],
//             datasets: [
//               {
//                 data: [920, 330],
//                 backgroundColor: ["#1D4ED8", "#3B82F6"],
//                 hoverOffset: 4,
//               },
//             ],
//           },
//           options: {
//             responsive: true,
//             plugins: {
//               legend: { position: "bottom" },
//             },
//           },
//         })
//       )
//     ),

//     // Story Categories Chart Section
//     React.createElement(
//       "div",
//       { style: styles.fullWidthChart },
//       React.createElement(
//         "div",
//         { style: styles.chartCard },
//         React.createElement("h3", { style: styles.chartTitle }, "Story Categories Distribution"),
//         React.createElement(Bar, {
//           data: {
//             labels: ["Health", "Technology", "Education", "Politics"],
//             datasets: [
//               {
//                 label: "Stories by Category",
//                 data: [12, 19, 3, 5],
//                 backgroundColor: ["#1D4ED8", "#2563EB", "#3B82F6", "#93C5FD"],
//                 borderWidth: 0,
//               },
//             ],
//           },
//           options: {
//             responsive: true,
//             plugins: {
//               legend: { position: "bottom" },
//             },
//             scales: {
//               y: { beginAtZero: true },
//             },
//           },
//         })
//       )
//     ),

//     // Table Section: Recent Stories
//     React.createElement(
//       "div",
//       { style: { marginTop: "32px" } },
//       React.createElement("h2", { style: { marginBottom: "16px", textAlign: "center" } }, "Recent Stories"),
//       tableLoading
//         ? React.createElement("p", { style: { textAlign: "center" } }, "Loading table data...")
//         : React.createElement(
//             "table",
//             { style: { width: "100%", borderCollapse: "collapse", marginBottom: "32px" } },
//             React.createElement(
//               "thead",
//               null,
//               React.createElement(
//                 "tr",
//                 null,
//                 React.createElement("th", { style: { border: "1px solid #ddd", padding: "8px" } }, "Title"),
//                 React.createElement("th", { style: { border: "1px solid #ddd", padding: "8px" } }, "Created At"),
//                 React.createElement("th", { style: { border: "1px solid #ddd", padding: "8px" } }, "Tags")
//               )
//             ),
//             React.createElement(
//               "tbody",
//               null,
//               tableData.map((story) =>
//                 React.createElement(
//                   "tr",
//                   { key: story._id },
//                   React.createElement("td", { style: { border: "1px solid #ddd", padding: "8px" } }, story.title),
//                   React.createElement("td", { style: { border: "1px solid #ddd", padding: "8px" } }, new Date(story.createdAt).toLocaleString()),
//                   React.createElement("td", { style: { border: "1px solid #ddd", padding: "8px" } }, Array.isArray(story.tags) ? story.tags.join(", ") : "")
//                 )
//               )
//             )
//           )
//     )
//   );
// };

// // Helper: Stat Card Component
// function createStatCard(title, value, color) {
//   return React.createElement(
//     "div",
//     {
//       style: {
//         ...styles.statCard,
//         backgroundColor: color,
//         boxShadow: `0 4px 6px -1px ${color}33`,
//       },
//     },
//     React.createElement("h3", { style: styles.statTitle }, title),
//     React.createElement("p", { style: styles.statValue }, value)
//   );
// }

// // Styles
// const styles = {
//   container: {
//     padding: "24px",
//     fontFamily: "'Inter', sans-serif",
//     backgroundColor: "#F8FAFC",
//     minHeight: "100vh",
//   },
//   header: {
//     marginBottom: "32px",
//     textAlign: "center",
//   },
//   title: {
//     color: "#1D4ED8",
//     fontSize: "2.5rem",
//     margin: "0 0 8px 0",
//     fontWeight: "700",
//   },
//   subtitle: {
//     color: "#64748B",
//     fontSize: "1.1rem",
//     margin: "0",
//   },
//   grid: {
//     display: "grid",
//     gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
//     gap: "24px",
//     marginBottom: "32px",
//   },
//   statCard: {
//     padding: "24px",
//     borderRadius: "12px",
//     color: "white",
//     transition: "transform 0.2s ease",
//     cursor: "pointer",
//   },
//   statTitle: {
//     fontSize: "16px",
//     margin: "0 0 8px 0",
//     fontWeight: "500",
//     opacity: "0.9",
//   },
//   statValue: {
//     fontSize: "24px",
//     margin: "0",
//     fontWeight: "700",
//   },
//   chartGrid: {
//     display: "grid",
//     gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
//     gap: "24px",
//     marginBottom: "32px",
//   },
//   chartCard: {
//     backgroundColor: "white",
//     borderRadius: "12px",
//     padding: "24px",
//     boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
//   },
//   chartTitle: {
//     color: "#1E293B",
//     fontSize: "1.2rem",
//     margin: "0 0 16px 0",
//     fontWeight: "600",
//   },
//   fullWidthChart: {
//     marginBottom: "32px",
//   },
//   loading: {
//     display: "flex",
//     justifyContent: "center",
//     alignItems: "center",
//     height: "100vh",
//     fontSize: "1.5rem",
//     color: "#64748B",
//   },
// };

// module.exports = Dashboard;
