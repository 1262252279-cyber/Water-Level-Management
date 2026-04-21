const sliderTrack = document.getElementById("team-slider-track");
const sliderDots = Array.from(document.querySelectorAll(".slider-dot"));

if (sliderTrack && sliderDots.length) {
  let currentSlide = 0;
  let autoSlide;

  function pulseCurrentCard() {
    const cards = Array.from(sliderTrack.querySelectorAll(".team-card"));
    cards.forEach((card, cardIndex) => {
      card.classList.toggle("is-active", cardIndex === currentSlide);
    });
  }

  function renderSlide(index) {
    currentSlide = index;
    sliderTrack.style.transform = `translateX(-${index * 100}%)`;

    sliderDots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === index);
    });

    pulseCurrentCard();
  }

  function restartAutoSlide() {
    clearInterval(autoSlide);
    autoSlide = setInterval(() => {
      const nextSlide = (currentSlide + 1) % sliderDots.length;
      renderSlide(nextSlide);
    }, 3200);
  }

  sliderDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      renderSlide(Number(dot.dataset.slide));
      restartAutoSlide();
    });
  });

  renderSlide(0);
  restartAutoSlide();
}
