document.querySelector("#self").addEventListener("click", () => {
    $("main > section").addClass("inactive");
    $("main > section").removeClass("active");
    $("#selfSection").addClass("active");
    $("#selfSection").removeClass("inactive");
});
document.querySelector("#family").addEventListener("click", () => {
    $("main > section").addClass("inactive");
    $("main > section").removeClass("active");
    $("#familySection").addClass("active");
    $("#familySection").removeClass("inactive");
});
document.querySelector("#tellYourStoryButton").addEventListener("click", () => {
    $("main > section").addClass("inactive");
    $("main > section").removeClass("active");
    $("#tellYourStorySection").addClass("active");
    $("#tellYourStorySection").removeClass("inactive");
});
document.querySelector("#friends").addEventListener("click", () => {
    $("main > section").addClass("inactive");
    $("main > section").removeClass("active");
    $("#friendsSection").addClass("active");
    $("#friendsSection").removeClass("inactive");
});
document.querySelector("#community").addEventListener("click", () => {
    $("main > section").addClass("inactive");
    $("main > section").removeClass("active");
    $("#communitySection").addClass("active");
    $("#communitySection").removeClass("inactive");
});

for (var i = 1; i <= document.querySelector(".familyTree").childElementCount; i++) {
    $(`.r${i}`).css("width", `${100.0 / document.querySelector(`.R${i}`).childElementCount}vw`);
}