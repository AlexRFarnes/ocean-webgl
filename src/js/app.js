import * as THREE from 'three';
import gsap from 'gsap';
import imagesLoaded from 'imagesloaded';
import FontFaceObserver from 'fontfaceobserver';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import Scroll from './scroll';
import fragment from './shaders/fragment.glsl';
import vertex from './shaders/vertex.glsl';
import noise from './shaders/noise.glsl';

import ocean from '../img/ocean.jpg';

export default class Sketch {
  constructor(options) {
    this.time = 0;
    this.container = options.dom;
    this.scene = new THREE.Scene();

    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    this.camera = new THREE.PerspectiveCamera(
      70,
      this.width / this.height,
      100,
      2000
    );

    this.camera.position.z = 600;

    // Calculates the camera's fov so that one unit in three.js is equivalent to one pixel
    this.camera.fov =
      2 * Math.atan(this.height / 2 / this.camera.position.z) * (180 / Math.PI);

    this.renderer = new THREE.WebGLRenderer({
      /*antialias: true,*/ alpha: true,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    // Get all the images on the web page
    this.images = [...document.querySelectorAll('img')];

    // Wait for fonts to be loaded
    const fontOpen = new Promise(resolve => {
      new FontFaceObserver('Open Sans').load().then(() => {
        resolve();
      });
    });

    const fontPlayfair = new Promise(resolve => {
      new FontFaceObserver('Playfair Display').load().then(() => {
        resolve();
      });
    });

    // Preload images
    const preloadImages = new Promise((resolve, reject) => {
      imagesLoaded(
        document.querySelectorAll('img'),
        { background: true },
        resolve
      );
    });

    let AllDone = [fontOpen, fontPlayfair, preloadImages];
    this.currentScroll = 0;
    this.previousScroll = 0;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Wait for the fonts and images to be loaded before getting the images' size and position
    Promise.all(AllDone).then(() => {
      this.scroll = new Scroll();
      // Get the position information from all the images
      this.addImages();
      // Set the position of the three.js planes
      this.setPosition();

      this.mouseMovement();
      this.resize();
      this.setupResize();
      this.composerPass();
      this.render();
    });
  }

  composerPass() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // custom shader pass
    let counter = 0.0;
    this.myEffect = {
      uniforms: {
        tDiffuse: { value: null },
        scrollSpeed: { value: null },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix 
            * modelViewMatrix 
            * vec4(position, 1.);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float scrollSpeed;
        varying vec2 vUv;
        uniform float time;
        ${noise}
        void main() {
          vec2 newUV = vUv;
          float areaImg = smoothstep(0.4, 0., vUv.y);
          areaImg = pow(areaImg, 10.);
          float area = smoothstep(1., 0.6, vUv.y) * 2. - 1.;
          float noise = 0.5 * (cnoise(vec3( vUv * 10., time / 5.)) + 1.);
          float n = smoothstep(0.5, 0.51, noise + area);
          // newUV.x += (vUv.x - 0.5) * 0.5 * vUv.y; 
          newUV.x -= (vUv.x - 0.5) * 0.1 * areaImg * scrollSpeed; 
          gl_FragColor = texture2D(tDiffuse, newUV);
          gl_FragColor.r += (vUv.x - 0.5) * 0.9 * areaImg * scrollSpeed; 
          gl_FragColor.g += (vUv.x - 0.5) * 0.4 * areaImg * scrollSpeed; 
          gl_FragColor.b += (vUv.x - 0.5) * 0.9 * areaImg * scrollSpeed; 
          // gl_FragColor = vec4(area, 0., 0., 1.);
          // gl_FragColor = vec4(n, 0., 0., 1.);
          gl_FragColor = mix(vec4(1.), texture2D(tDiffuse, newUV), n);
        }
      `,
    };

    this.customPass = new ShaderPass(this.myEffect);
    this.customPass.renderToScreen = true;

    this.composer.addPass(this.customPass);
  }

  mouseMovement() {
    window.addEventListener(
      'mousemove',
      event => {
        this.mouse.x = (event.clientX / this.width) * 2 - 1;
        this.mouse.y = -(event.clientY / this.height) * 2 + 1;

        // update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // calculate objects intersecting the ray
        const intersects = this.raycaster.intersectObjects(this.scene.children);

        if (intersects.length > 0) {
          // console.log(intersects[0].uv);
          let obj = intersects[0].object;
          // set the hover uniform to the intersects uv coordiantes
          obj.material.uniforms.hover.value = intersects[0].uv;
        }
      },
      false
    );
  }

  setupResize() {
    window.addEventListener('resize', this.resize.bind(this));
  }

  resize() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    // Update the position of the planes and scale them based on the images' width and height
    this.imageStore.forEach(obj => {
      let bounds = obj.img.getBoundingClientRect();

      obj.top = bounds.top + this.scroll.scrollToRender;
      obj.left = bounds.left;
      obj.width = bounds.width;
      obj.height = bounds.height;
      obj.mesh.scale.set(bounds.width, bounds.height, 1);
    });

    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.fov =
      2 * Math.atan(this.height / 2 / this.camera.position.z) * (180 / Math.PI);
    this.camera.updateProjectionMatrix();
  }

  addImages() {
    const loader = new THREE.TextureLoader();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        uImage: { value: null },
        hover: { value: new THREE.Vector2(0.5, 0.5) },
        hoverState: { value: 0 },
      },
      side: THREE.DoubleSide,
      fragmentShader: fragment,
      vertexShader: vertex,
      // wireframe: true,
    });

    this.materials = [];

    this.imageStore = this.images.map(img => {
      // Get the position information of each image
      let bounds = img.getBoundingClientRect();

      // Create a geometry with the size of the image
      // let geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, 10, 10);

      // Create the geometry with a size of 1x1 and then scale it base on the image's width and height on the resize method
      let geometry = new THREE.PlaneGeometry(1, 1, 10, 10);

      // In three.js textures can be created from the DOM images
      // let texture = new THREE.Texture(img); // Had trouble loading the header image

      // Use the load method of the loader instance
      let texture = loader.load(img.src);

      let material = this.material.clone();

      img.addEventListener('mouseenter', () => {
        gsap.to(material.uniforms.hoverState, {
          duration: 1,
          value: 1,
        });
      });

      img.addEventListener('mouseleave', () => {
        gsap.to(material.uniforms.hoverState, {
          duration: 1,
          value: 0,
        });
      });

      this.materials.push(material);

      material.uniforms.uImage.value = texture;

      let mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(bounds.width, bounds.height, 1);

      this.scene.add(mesh);

      return {
        img: img,
        mesh: mesh,
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    });
  }

  setPosition() {
    this.imageStore.forEach(obj => {
      // -obj.top because coordinate directions are inverted vertically
      obj.mesh.position.y =
        this.currentScroll - obj.top + this.height / 2 - obj.height / 2;
      // -obj.top => is the actual position of the DOM images vertically
      // + this.height / 2 => shift the corrdinate system between the DOM and three.js because the origin of the DOM is on the top and three.js is in the center
      // - obj.height / 2 => shift the position because the bounding box's origin is on the top and three.js is in the center
      obj.mesh.position.x = obj.left - this.width / 2 + obj.width / 2;
      // obj.left => is the actual position of the DOM images horizontally
      // - this.width / 2 => shift the corrdinate system between the DOM and three.js because the origin of the DOM is on the left and three.js is in the center
      // + obj.width / 2 => shift the position because the bounding box's origin is on the left and three.js is in the center
    });
  }

  addObjects() {
    this.geometry = new THREE.PlaneGeometry(
      bounds.width,
      bounds.height,
      10,
      10
    );
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        oceanTexture: { value: new THREE.TextureLoader().load(ocean) },
      },
      side: THREE.DoubleSide,
      fragmentShader: fragment,
      vertexShader: vertex,
      wireframe: true,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // this.scene.add(this.mesh);
  }

  render() {
    this.time += 0.05;
    this.scroll.render();
    this.previousScroll = this.currentScroll;
    this.currentScroll = this.scroll.scrollToRender;

    // if(Math.round(this.currentScroll) !== Math.round(this.previousScroll)){}

    this.setPosition();
    this.customPass.uniforms.scrollSpeed.value = this.scroll.speedTarget;
    this.customPass.uniforms.time.value = this.time;

    // this.material.uniforms.time.value = this.time;
    this.materials.forEach(m => {
      m.uniforms.time.value = this.time;
    });

    // this.renderer.render(this.scene, this.camera);
    this.composer.render();

    window.requestAnimationFrame(this.render.bind(this));
  }
}

new Sketch({
  dom: document.getElementById('container'),
});
