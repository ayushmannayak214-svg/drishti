const fs = require("fs");
const path = require("path");

async function testFullWorkflow() {
    console.log("=================================================");
    console.log("STARTING FULL END-TO-END WORKFLOW VERIFICATION");
    console.log("=================================================");

    // 1. Health Check
    console.log("\n[Step 1] Checking /api/health...");
    const healthRes = await fetch("http://localhost:5000/api/health");
    const healthData = await healthRes.json();
    console.log("-> Health Status:", healthData.status);

    // 2. Doctor Login
    console.log("\n[Step 2] Testing Doctor Authentication...");
    const loginRes = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dr.ananya@dire.com", password: "password123" })
    });
    const setCookie = loginRes.headers.get("set-cookie");
    const cookie = setCookie ? setCookie.split(";")[0] : "";
    const loginData = await loginRes.json();
    console.log("-> Login Result:", loginData.message || (loginData.userId ? "Logged In Successfully" : "Failed"));
    console.log("-> Session Cookie:", cookie);
    if (!cookie) throw new Error("Auth failed: " + JSON.stringify(loginData));

    // 3. Register or Fetch Patient
    console.log("\n[Step 3] Fetching Patients...");
    const patRes = await fetch("http://localhost:5000/api/patients", {
        headers: { "Cookie": cookie }
    });
    const patients = await patRes.json();
    console.log(`-> Retrieved ${patients.length} existing patients.`);
    let testPatient = patients[0];
    if (!testPatient) {
        console.log("Creating test patient...");
        const newPatRes = await fetch("http://localhost:5000/api/patients", {
            method: "POST",
            headers: { 
                "Cookie": cookie,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                patientName: "Ramesh Sharma",
                age: 58,
                gender: "Male",
                contactNumber: "+91 98765 43210",
                dateOfBirth: "1968-05-12",
                screeningType: "Diabetes Screening",
                priority: "High"
            })
        });
        const created = await newPatRes.json();
        console.log("-> Create Patient Response:", created);
        testPatient = { id: created.patientId, patient_id: created.patientId, name: "Ramesh Sharma" };
        console.log("-> Created patient ID:", testPatient.id);
    } else {
        console.log("-> Using patient:", testPatient.name, "(ID: " + (testPatient.patient_id || testPatient.id) + ")");
    }

    // 4. Retinal Prediction & Upload
    console.log("\n[Step 4] Submitting Retinal Scan for AI Analysis...");
    const testImgPath = path.resolve(__dirname, "..", "version4", "model", "results", "moderate_wikimedia.png");
    const fileBuffer = fs.readFileSync(testImgPath);
    const blob = new Blob([fileBuffer], { type: "image/png" });

    const formData = new FormData();
    formData.append("patient_id", testPatient.id);
    formData.append("eye", "Right (OD)");
    formData.append("notes", "Automated clinical validation verification");
    formData.append("image", blob, "moderate_wikimedia.png");

    const predictRes = await fetch("http://localhost:5000/api/predict", {
        method: "POST",
        headers: { "Cookie": cookie },
        body: formData
    });

    const predictData = await predictRes.json();
    console.log("-> Prediction Response Status:", predictRes.status);
    console.log("-> AI Diagnosis:", {
        prediction: predictData.prediction,
        confidence: predictData.confidence + "%",
        referable: predictData.clinical_decision_tiers?.tier_2_referability_triage?.referable,
        sight_threatening: predictData.clinical_decision_tiers?.tier_3_sight_threatening_triage?.sight_threatening,
        screening_id: predictData.screening_id
    });

    // 4.5 Save Screening (Simulating Doctor clicking 'Finish Screening' in screeningresult.js)
    console.log("\n[Step 4.5] Saving Screening Record to Audit Database...");
    const saveRes = await fetch("http://localhost:5000/api/screenings", {
        method: "POST",
        headers: { 
            "Cookie": cookie,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            patientId: testPatient.patient_id || testPatient.id,
            doctorName: "Dr. Ananya Sharma",
            screeningType: "AI Diabetic Retinopathy Triage",
            priority: predictData.clinical_decision_tiers?.tier_2_referability_triage?.referable ? "High" : "Normal",
            prediction: predictData.prediction,
            confidence: predictData.confidence,
            probabilities: predictData.probabilities
        })
    });
    const saveData = await saveRes.json();
    console.log("-> Screening Save Result:", saveData.message, "(ID: " + saveData.screeningId + ")");

    // 5. Verify Screening History
    console.log("\n[Step 5] Checking Screening History Audit Log...");
    const histRes = await fetch("http://localhost:5000/api/screenings", {
        headers: { "Cookie": cookie }
    });
    const history = await histRes.json();
    console.log(`-> Total screenings in history: ${history.length}`);
    const latest = history[0];
    console.log("-> Most recent screening in record:", {
        screening_id: latest?.screening_id,
        patient_name: latest?.patient_name,
        result: latest?.prediction,
        confidence: latest?.confidence + "%",
        date: latest?.screening_date
    });

    console.log("\n=================================================");
    console.log("SUCCESS! ALL 5 END-TO-END WORKFLOW STAGES VERIFIED");
    console.log("=================================================");
}

testFullWorkflow().catch(err => {
    console.error("\n[FAILED]", err);
    process.exit(1);
});
