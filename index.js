const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const fileUpload = require("express-fileupload");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8czld.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];

    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("foviaDoctor");
    const appointmentsCollection = database.collection("appointments");
    const usersCollection = database.collection("users");
    const doctorsCollection = database.collection("doctors");
    const feedbackCollection = database.collection("feedback");

    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentsCollection.insertOne(appointment);
      res.json(result);
    });

    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;
      console.log(date);
      const query = { email: email, date: date };
      const cursor = appointmentsCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    });

    app.get("/doctors", async (req, res) => {
      const cursor = doctorsCollection.find({});
      const doctors = await cursor.toArray();
      res.json(doctors);
    });

    app.get("/doctors/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const doctor = await doctorsCollection.findOne(query);
      res.json(doctor);
    });

    app.delete("/doctors/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const doctor = await doctorsCollection.deleteOne(query);
      res.json(doctor);
    });

    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const title = req.body.title;
      const doctorPic = req.files.image;
      const signature = req.files.signature;
      const description = req.body.description;
      const picData = doctorPic.data;
      const signatureData = signature.data;
      const encodedPic = picData.toString("base64");
      const encodedSignature = signatureData.toString("base64");
      const imageBuffer = Buffer.from(encodedPic, "base64");
      const signatureImgBuffer = Buffer.from(encodedSignature, "base64");

      const doctor = {
        name,
        email,
        title,
        image: imageBuffer,
        signatureImg: signatureImgBuffer,
        description,
      };

      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
    });

    app.post("/feedback", async (req, res) => {
      const name = req.body.name;
      const title = req.body.title;
      const image = req.files.image;
      const feedback = req.body.feedback;
      const imageData = image.data;

      const encodedImage = imageData.toString("base64");
      const imageBuffer = Buffer.from(encodedImage, "base64");

      const userfeedBack = {
        name,
        title,
        image: imageBuffer,
        feedback,
        status: 1,
      };

      const result = await feedbackCollection.insertOne(userfeedBack);
      res.json(result);
    });
 
    app.get("/feedback", async (req, res) => {
      const cursor = feedbackCollection.find({}).limit(6);
      const result = await cursor.toArray();
      console.log(result);
      res.json(result);
    });
    
    app.post("/feedback/:id", async (req, res) => {
      const status = req.query.status;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      let updateDoc = {};
      if (status === "pending") {
         updateDoc = { $set: { status: "2" } };
      }else{
         updateDoc = { $set: { status: "1" } };
      }
      const feedback = await feedbackCollection.updateOne(query, updateDoc);
      res.json(feedback);
    });

    app.delete("/feedback/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const feedback = await feedbackCollection.deleteOne(query);
      res.json(feedback);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      console.log(result);
      res.json(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role == "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      console.log(result);
      res.json(result);
    });

    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      console.log(req.decodedEmail);
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ message: "You do not have permission to make admin" });
      }
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Fovia Server is Running!");
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
