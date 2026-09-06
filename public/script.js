$("#self").click(() => {
    $("#selfSection").removeClass("none");
    setTimeout(() => {
        $("main > section").addClass("inactive");
        $("main > section").removeClass("active");
        $("#selfSection").addClass("active");
        $("#selfSection").removeClass("inactive");
    }, 1);
    setTimeout(() => {
        $("main > section").addClass("none");
        $("#selfSection").removeClass("none");
    }, 801);
});
$("#family").click(() => {
    $("#familySection").removeClass("none");
    setTimeout(() => {
        $("main > section").addClass("inactive");
        $("main > section").removeClass("active");
        $("#familySection").addClass("active");
        $("#familySection").removeClass("inactive");
    }, 1);
    setTimeout(() => {
        $("main > section").addClass("none");
        $("#familySection").removeClass("none");
    }, 801);
});
$("#tellYourStoryButton").click(() => {
    $("#tellYourStorySection").removeClass("none");
    setTimeout(() => {
        $("main > section").addClass("inactive");
        $("main > section").removeClass("active");
        $("#tellYourStorySection").addClass("active");
        $("#tellYourStorySection").removeClass("inactive");
    }, 1);
    setTimeout(() => {
        $("main > section").addClass("none");
        $("#tellYourStorySection").removeClass("none");
    }, 801);
});
$("#friends").click(() => {
    $("#friendsSection").removeClass("none");
    setTimeout(() => {
        $("main > section").addClass("inactive");
        $("main > section").removeClass("active");
        $("#friendsSection").addClass("active");
        $("#friendsSection").removeClass("inactive");
    }, 1);
    setTimeout(() => {
        $("main > section").addClass("none");
        $("#friendsSection").removeClass("none");
    }, 801);
});
$("#community").click(() => {
    $("#communitySection").removeClass("none");
    setTimeout(() => {
        $("main > section").addClass("inactive");
        $("main > section").removeClass("active");
        $("#communitySection").addClass("active");
        $("#communitySection").removeClass("inactive");
    }, 1);
    setTimeout(() => {
        $("main > section").addClass("none");
        $("#communitySection").removeClass("none");
    }, 801);
});
var curRowCount = 3;
$("#addRow").click(() => {
    curRowCount++;
    document.querySelector(".familyTree").innerHTML += `
    <div class="familyTreeRow R${curRowCount}">
        <div class="r3 c1">
            <h3>Unnamed
                <img src="profile.jpg" alt="profile" />
            </h3>
        </div>
    </div>
    <button class="familyTreeRowAddBtn AR${curRowCount}">Add</button>`;
});
$("#removeRow").click(() => {
    curRowCount--;
    document.querySelector(".familyTree").removeChild(document.querySelector(".familyTree").lastChild);
    document.querySelector(".familyTree").removeChild(document.querySelector(".familyTree").lastChild);
    document.querySelector(".familyTree").removeChild(document.querySelector(".familyTree").lastChild);
    document.querySelector(".familyTree").removeChild(document.querySelector(".familyTree").lastChild);
});