var data = {
    "info": {
        "username": "User",
        "phone": "123-456-7890",
        "email": "veryrealemail@veryrealwebsite.com"
    }
};
document.querySelector("#username").innerText = data.info.username;
document.querySelector("#phone").innerText = data.info.phone;
document.querySelector("#email").innerText = data.info.email;