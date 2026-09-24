const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "version4", "model");
const testImages = [
    path.resolve(__dirname, "..", "version4", "model", "results", "normal_benchmark.png"),
    path.resolve(__dirname, "..", "version4", "model", "results", "moderate_wikimedia.png"),
    path.resolve(__dirname, "..", "version4", "model", "results", "pdr_wikimedia.jpg"),
    path.resolve(__dirname, "..", "version4", "model", "results", "last_uploaded.png"),
];

async function runTest(img) {
    return new Promise((resolve) => {
        console.log("\n==========================================");
        console.log("Testing Python predict.py on:", path.basename(img));
        const py = spawn("python", ["-u", "predict.py", img], { cwd: projectRoot });

        let out = "";
        let err = "";

        py.stdout.on("data", d => out += d.toString());
        py.stderr.on("data", d => err += d.toString());

        py.on("close", code => {
            console.log("Exit Code:", code);
            if (err) console.log("Stderr:", err.trim());
            try {
                const json = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
                console.log("Result:", {
                    grade: json.prediction,
                    confidence: json.confidence + "%",
                    referable: json.clinical_decision_tiers?.tier_2_referability_triage?.referable,
                    sight_threatening: json.clinical_decision_tiers?.tier_3_sight_threatening_triage?.sight_threatening,
                    abstention: json.clinical_decision_tiers?.tier_5_uncertainty_abstention?.clinical_abstention_flag,
                });
            } catch (e) {
                console.log("Raw Output:", out);
                console.error("Parse Error:", e.message);
            }
            resolve();
        });
    });
}

(async () => {
    for (const img of testImages) {
        await runTest(img);
    }
})();

