// lightbox.js - Simpan di public/js/lightbox.js

class Lightbox {
    constructor() {
        this.images = [];
        this.currentIndex = 0;
        this.isOpen = false;
        
        this.createModal();
        this.init();
    }
    
    createModal() {
        // Buat modal lightbox
        const modal = document.createElement('div');
        modal.className = 'lightbox-modal';
        modal.id = 'lightboxModal';
        modal.innerHTML = `
            <span class="lightbox-close">&times;</span>
            <button class="lightbox-prev">&#10094;</button>
            <button class="lightbox-next">&#10095;</button>
            <div class="lightbox-container">
                <img class="lightbox-image" src="" alt="">
                <div class="lightbox-caption"></div>
                <div class="lightbox-counter"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        this.modal = modal;
        this.imgElement = modal.querySelector('.lightbox-image');
        this.captionElement = modal.querySelector('.lightbox-caption');
        this.counterElement = modal.querySelector('.lightbox-counter');
        this.closeBtn = modal.querySelector('.lightbox-close');
        this.prevBtn = modal.querySelector('.lightbox-prev');
        this.nextBtn = modal.querySelector('.lightbox-next');
        
        // Event listeners
        this.closeBtn.addEventListener('click', () => this.close());
        this.prevBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
        
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'ArrowRight') this.next();
        });
    }
    
    open(images, index = 0, caption = '') {
        this.images = images;
        this.currentIndex = index;
        this.isOpen = true;
        
        this.updateImage();
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    updateImage() {
        const image = this.images[this.currentIndex];
        if (image) {
            this.imgElement.src = image.url;
            this.captionElement.textContent = image.caption || '';
            this.counterElement.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
        }
    }
    
    prev() {
        if (this.images.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
        this.updateImage();
    }
    
    next() {
        if (this.images.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.images.length;
        this.updateImage();
    }
    
    close() {
        this.isOpen = false;
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Inisialisasi lightbox
const lightbox = new Lightbox();

// Fungsi untuk membuka lightbox dari elemen gambar
function openLightbox(images, index, caption) {
    lightbox.open(images, index, caption);
}