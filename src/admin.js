// const path = require("path");
// const mongoose = require("mongoose");
// const fs = require("fs");
// const userStoriesPath = path.join(__dirname, "admin", "UserStories.js");
// console.log("File exists:", fs.existsSync(userStoriesPath));

// const setupAdminJS = async () => {
//   const { default: AdminJS } = await import("adminjs");
//   const { Database, Resource } = await import("@adminjs/mongoose");
//   const { default: AdminJSExpress } = await import("@adminjs/express");

//   // Register the AdminJS Mongoose adapter
//   AdminJS.registerAdapter({ Database, Resource });
// // 
//   // Import Mongoose Models
//   const BaseUser = require("./models/User");
//   const StandardUser = require("./models/StandardUser");
//   const OAuthUser = require("./models/OAuthUser");
//   const Story = require("./models/Story");
//   const Chat = require("./models/Chats"); // Import the Chat model

//   const { ComponentLoader } = await import("adminjs");
//   const componentLoader = new ComponentLoader();

//   // ✅ Correctly Register UI Components with explicit .js extensions
//   const adminDir = path.join(__dirname, "admin");
//   const components = {
//     Dashboard: componentLoader.add("Dashboard", path.join(adminDir, "Dashboard.js")),
//     Reports: componentLoader.add("Reports", path.join(adminDir, "Reports.js")),
//     FineTuneUpload: componentLoader.add("FineTuneUpload", path.join(adminDir, "FineTuneUpload.js")),
//     UserStories: componentLoader.add("UserStories", path.join(adminDir, "UserStories.js")),
//     Notifications: componentLoader.add("Notifications", path.join(adminDir, "Notifications.js"))
//   };

//   console.log("Registered components:", componentLoader.getComponents());

//   // Define AdminJS options with our added custom feature(s)
//   const adminJsOptions = {
//     resources: [
//       {
//         resource: BaseUser,
//         options: {
//           listProperties: ["firstName", "lastName", "email", "profilePicture", "createdAt"],
//           sort: { sortBy: "createdAt", direction: "desc" },
//           properties: {
//             stories: {
//               type: "mixed",
//               isVisible: { list: true, filter: false, show: true, edit: false },
//               components: { show: components.UserStories }
//             }
//           }
//         }
//       },
//       {
//         resource: StandardUser,
//         options: {
//           listProperties: ["firstName", "lastName", "email", "phoneNumber", "isVerified"],
//           sort: { sortBy: "createdAt", direction: "desc" },
//         }
//       },
//       {
//         resource: OAuthUser,
//         options: {
//           listProperties: ["firstName", "lastName", "email", "provider", "providerId"],
//           sort: { sortBy: "createdAt", direction: "desc" },
//         }
//       },
//       {
//         resource: Story,
//         options: {
//           listProperties: ["title", "generatedBy", "createdAt"],
//           sort: { sortBy: "createdAt", direction: "desc" },
//           actions: {
//             new: { isAccessible: true },
//             edit: { isAccessible: true },
//             delete: { isAccessible: true },
//             // NEW: Custom Export CSV Action for the Story resource
//             exportCsv: {
//               actionType: "resource",
//               icon: "DocumentExport",
//               isAccessible: true,
//               handler: async (request, response, context) => {
//                 const { records } = context;
//                 if (!records || records.length === 0) {
//                   response.status(404).json({ message: "No records found to export." });
//                   return;
//                 }
//                 // Create CSV headers and rows
//                 const headers = ["Title", "GeneratedBy", "CreatedAt"];
//                 const rows = records.map(record => {
//                   const { title, generatedBy, createdAt } = record.params;
//                   return `${title},${generatedBy},${createdAt}`;
//                 });
//                 const csvData = [headers.join(","), ...rows].join("\n");
//                 response.setHeader("Content-Type", "text/csv");
//                 response.setHeader("Content-Disposition", "attachment; filename=stories.csv");
//                 response.send(csvData);
//                 return { record: records };
//               },
//               component: false
//             }
//           }
//         }
//       },
//       {
//         resource: Chat,
//         options: {
//           listProperties: ["userId", "name", "createdAt"],
//           sort: { sortBy: "createdAt", direction: "desc" },
//           properties: {
//             messages: {
//               type: "mixed",
//               isVisible: { list: false, show: true, edit: false }
//             }
//           }
//         }
//       }
//     ],
//     dashboard: {
//       handler: async () => {
//         return { message: "Welcome to the NWSROOM Admin Dashboard" };
//       },
//       component: components.Dashboard // ✅ Correctly Registered Dashboard Component
//     },
//     branding: {
//       companyName: "NWSROOM Admin",
//       logo: "https://yourcompany.com/logo.png",
//       theme: {
//         colors: {
//           primary100: "#1D4ED8",
//           primary80: "#2563EB",
//           primary60: "#3B82F6",
//           primary40: "#93C5FD",
//           primary20: "#DBEAFE"
//         }
//       }
//     },
//     pages: {
//       reports: {
//         label: "Reports",
//         component: components.Reports // ✅ Correctly Registered Reports Component
//       },
//       fineTuneUpload: {
//         label: "Fine-Tune Upload",
//         component: components.FineTuneUpload // ✅ Correctly Registered FineTuneUpload Component
//       },
//       // NEW: Optional custom page for notifications
//       notifications: {
//         label: "Notifications",
//         component: components.Notifications
//       }
//     },
//     componentLoader,
//     rootPath: "/admin"
//   };

//   const admin = new AdminJS(adminJsOptions);

//   // Secure the AdminJS router with basic authentication using env variables
//   const adminRouter = AdminJSExpress.buildAuthenticatedRouter(admin, {
//     authenticate: async (email, password) => {
//       const adminEmail = process.env.ADMIN_EMAIL;
//       const adminPassword = process.env.ADMIN_PASSWORD;
//       if (email === adminEmail && password === adminPassword) {
//         return { email };
//       }
//       return null;
//     },
//     cookiePassword: process.env.ADMIN_COOKIE_SECRET || "default_cookie_secret"
//   });

//   return { admin, adminRouter };
// };

// module.exports = setupAdminJS;
