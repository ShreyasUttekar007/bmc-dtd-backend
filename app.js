const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const jwt = require("jsonwebtoken");
const config = require("./config");
const authMiddleware = require("./middleware/authMiddleware");
const errorHandler = require("./middleware/errorHandler");
const authRoutes = require("./routes/auth");
const boothEntryRoutes = require("./routes/boothEntryRoutes");
const userProfileRoutes = require("./routes/userProfileRoutes");
const boothEntriesAdminReport = require("./routes/boothEntriesAdminReport");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.all("*", function (req, res, next) {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN);
  res.header("Access-Control-Allow-Credentials", true);
  res.header("Access-Control-Expose-Headers", "*");
  res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Access-Control-Allow-Origin, Access-Control-Expose-Headers"
  );
  next();
});
mongoose
  .connect(config.mongodbURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.log("Error connecting to MongoDB:", error);
  });

const store = new MongoDBStore({
  uri: process.env.MONGODB_URI,
  collection: "sessions",
});

app.use(
  session({
    secret: "iuZeL0LrnkO5K$edr3RWD!S!q",
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
      maxAge: 36000000, //3600000ms = 1hr
      sameSite: "none",
      secure: true,
    },
  })
);

app.use(bodyParser.json());
app.use(morgan("dev"));
app.use(cookieParser());

app.use(authMiddleware);

app.use(errorHandler);

app.use("/api/auth", authRoutes);
app.use("/api/booth-entries", boothEntryRoutes);
app.use("/api/user-profile", userProfileRoutes);
app.use("/api/booth-report", boothEntriesAdminReport);


if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "client/build/index.html"));
  });
}

// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
