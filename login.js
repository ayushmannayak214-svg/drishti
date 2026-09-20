const loginForm = document.getElementById("loginForm");
const demoLoginBtn = document.getElementById("demoLoginBtn");

if (demoLoginBtn) {
    demoLoginBtn.addEventListener("click", () => {
        document.getElementById("email").value = "dr.ananya@dire.com";
        document.getElementById("password").value = "password123";
    });
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(
            "/api/auth/login",
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Invalid credentials");
            return;
        }

        localStorage.setItem("doctorName", data.name);
        localStorage.setItem("userId", data.userId);
        localStorage.setItem("userRole", data.role);

        window.location.href = "dashboard.html";

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        alert("Unable to connect to the server. Please ensure the DRISHTI backend server is running.");
    }
});