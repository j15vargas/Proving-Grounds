/* script.js
   StorageEngine abstracts data storage so you can later swap localStorage for API calls.
   Current implementation uses localStorage.
*/

const StorageEngine = {
  key: "storeProducts_v1",

  // get all products
  async getAll(){
    // replace with fetch('/api/products') for backend
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) : [];
  },

  // save all products array
  async saveAll(products){
    // replace with POST/PUT to backend later
    localStorage.setItem(this.key, JSON.stringify(products));
    return products;
  },

  // add product
  async add(product){
    const all = await this.getAll();
    all.push(product);
    await this.saveAll(all);
    return product;
  },

  // update product by id
  async update(product){
    const all = await this.getAll();
    const idx = all.findIndex(p=>p.id === product.id);
    if(idx === -1) throw new Error("Not found");
    all[idx] = product;
    await this.saveAll(all);
    return product;
  },

  // delete by id
  async delete(id){
    const all = await this.getAll();
    const filtered = all.filter(p=>p.id !== id);
    await this.saveAll(filtered);
    return filtered;
  }
};

/* ---------- Admin UI functions ---------- */

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8) }

/* Rendering product list in admin (index.html) */
async function renderAdminList(container){
  const list = await StorageEngine.getAll();
  container.innerHTML = "";
  if(list.length === 0){
    container.innerHTML = `<div class="card center text-muted">No products yet. Add one using the form.</div>`;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "products-list";

  list.forEach(prod=>{
    const row = document.createElement("div");
    row.className = "product-row card";

    const thumb = document.createElement("div"); thumb.className="product-thumb";
    const img = document.createElement("img");
    img.src = (prod.images && prod.images.find(i=>i)) || '';
    img.alt = prod.name || 'thumb';
    if(prod.images && prod.images.some(i=>i)) thumb.appendChild(img);
    else thumb.innerText = "No image";

    const info = document.createElement("div"); info.className="product-info";
    info.innerHTML = `<h3 class="product-title">${escapeHtml(prod.name)}</h3>
      <p class="product-desc">${escapeHtml(prod.description)}</p>
      <div class="product-meta">
        <div class="price">$${Number(prod.price).toFixed(2)}</div>
        <div class="meta-small">ID: ${prod.id}</div>
      </div>`;

    // small gallery
    const small = document.createElement("div"); small.className="small-gallery";
    (prod.images || []).forEach(src=>{
      const s = document.createElement("img");
      if(src) s.src = src;
      else s.style.opacity = 0.25, s.style.background="#f3f4f6";
      small.appendChild(s);
    });
    info.appendChild(small);

    // actions
    const actions = document.createElement("div"); actions.style.marginTop='10px';
    const editBtn = mkBtn("Edit","ghost small",()=>openEditModal(prod.id));
    const imgBtn = mkBtn("Images","ghost small",()=>openImageManager(prod.id));
    const delBtn = mkBtn("Delete","danger small", async ()=>{ if(confirm("Delete product?")){ await StorageEngine.delete(prod.id); await renderAdminList(container); } });

    actions.appendChild(editBtn); actions.appendChild(imgBtn); actions.appendChild(delBtn);

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(actions);
    wrapper.appendChild(row);
  });

  container.appendChild(wrapper);
}

/* create buttons helper */
function mkBtn(text, cls, onClick){
  const b = document.createElement("button");
  b.innerText = text;
  b.className = "btn " + (cls||"");
  b.addEventListener("click", onClick);
  return b;
}

/* escape html simple */
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }

/* ---------- Admin: Add / Edit product ---------- */
/*
  We'll create a form-driven add/edit workflow in the admin page.
  The form will create an object:
  {
    id,
    name,
    description,
    price,
    type: 'apparel' | 'non-apparel',
    sizes: {S:0,M:0,L:0,XL:0,XXL:0},
    images: [null,null,...] length=6
  }
*/
function createEmptyProduct(){
  return {
    id: uid(),
    name: "",
    description: "",
    price: 0,
    type: "non-apparel",
    sizes: {S:0,M:0,L:0,XL:0,XXL:0},
    images: Array(6).fill(null)
  };
}

/* fill form with product */
function fillFormWith(product, formEl){
  formEl.querySelector("#prodId").value = product.id;
  formEl.querySelector("#name").value = product.name || "";
  formEl.querySelector("#description").value = product.description || "";
  formEl.querySelector("#price").value = product.price || 0;
  formEl.querySelector("#type").value = product.type || "non-apparel";
  ["S","M","L","XL","XXL"].forEach(sz=>{
    const el = formEl.querySelector(`#size-${sz}`);
    if(el) el.value = product.sizes ? (product.sizes[sz]||0) : 0;
  });
}

/* read product from form */
function readForm(formEl){
  const id = formEl.querySelector("#prodId").value || uid();
  const name = formEl.querySelector("#name").value.trim();
  const description = formEl.querySelector("#description").value.trim();
  const price = parseFloat(formEl.querySelector("#price").value) || 0;
  const type = formEl.querySelector("#type").value;
  const sizes = {};
  ["S","M","L","XL","XXL"].forEach(sz=>{
    sizes[sz] = parseInt(formEl.querySelector(`#size-${sz}`).value) || 0;
  });

  return { id, name, description, price, type, sizes, images: Array(6).fill(null) };
}

/* ---------- Image manager ---------- */

/*
 image manager UI: shows 6 slots, each clickable to upload / replace / clear.
 supports drag & drop onto a slot.
*/
function initImageManager(container, product){
  container.innerHTML = "";
  container.className = "card";
  const title = document.createElement("h3"); title.innerText = "Manage Images (6 slots)"; container.appendChild(title);

  const grid = document.createElement("div"); grid.className = "image-slots";
  container.appendChild(grid);

  // ensure images array length 6
  product.images = product.images || Array(6).fill(null);
  while(product.images.length < 6) product.images.push(null);

  product.images.forEach((src, i)=>{
    const slot = document.createElement("div");
    slot.className = "slot card";
    slot.dataset.index = i;

    const num = document.createElement("div"); num.className="slot-num"; num.innerText = `#${i+1}`;
    slot.appendChild(num);

    if(src){
      const img = document.createElement("img"); img.src = src; slot.appendChild(img);
    } else {
      slot.innerHTML += `<div class="center text-muted">Empty</div>`;
    }

    // click opens file dialog
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    slot.appendChild(input);

    // replace handler
    input.addEventListener("change", async (e)=>{
      const f = e.target.files[0];
      if(!f) return;
      const data = await fileToDataURL(f);
      product.images[i] = data;
      await StorageEngine.update(product);
      // re-init manager
      initImageManager(container, product);
      // also update admin list UI if present
      const listContainer = document.querySelector("#adminProducts");
      if(listContainer) renderAdminList(listContainer);
    });

    // drag & drop
    ;["dragenter","dragover"].forEach(ev=>{
      slot.addEventListener(ev, e=>{ e.preventDefault(); slot.classList.add("drop-highlight"); });
    });
    ;["dragleave","drop"].forEach(ev=>{
      slot.addEventListener(ev, e=>{ e.preventDefault(); slot.classList.remove("drop-highlight"); });
    });
    slot.addEventListener("drop", async (e)=>{
      const file = e.dataTransfer.files[0];
      if(!file) return;
      const data = await fileToDataURL(file);
      product.images[i] = data;
      await StorageEngine.update(product);
      initImageManager(container, product);
      const listContainer = document.querySelector("#adminProducts");
      if(listContainer) renderAdminList(listContainer);
    });

    // clicking opens file input
    slot.addEventListener("click", ()=> input.click());

    // right-click to clear image
    slot.addEventListener("contextmenu", async (e)=>{
      e.preventDefault();
      if(confirm("Clear this image?")){
        product.images[i] = null;
        await StorageEngine.update(product);
        initImageManager(container, product);
        const listContainer = document.querySelector("#adminProducts");
        if(listContainer) renderAdminList(listContainer);
      }
    });

    grid.appendChild(slot);
  });

  // helper text
  const hint = document.createElement("div"); hint.className="text-muted";
  hint.style.marginTop="10px";
  hint.innerText = "Click a slot to upload/replace. Drag & drop an image onto a slot. Right-click to clear.";
  container.appendChild(hint);
}

/* helper to read file -> dataURL */
function fileToDataURL(file){
  return new Promise((res, rej)=>{
    const r=new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ---------- Admin page bootstrap (index.html) ---------- */
async function bootstrapAdmin(){
  // elements
  const productsContainer = document.getElementById("adminProducts");
  const form = document.getElementById("productForm");
  const imageManagerArea = document.getElementById("imageManager");

  // render list
  await renderAdminList(productsContainer);

  // new product handler
  document.getElementById("newProductBtn").addEventListener("click", async ()=>{
    const p = createEmptyProduct();
    // save to storage and render and open form
    await StorageEngine.add(p);
    await renderAdminList(productsContainer);
    openEditModal(p.id);
  });

  // form submit
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const data = readForm(form);

    // load existing product images if editing
    const existing = (await StorageEngine.getAll()).find(x=>x.id===data.id);
    data.images = existing ? existing.images || Array(6).fill(null) : Array(6).fill(null);

    // for non-apparel, zero sizes
    if(data.type !== 'apparel'){ data.sizes = {S:0,M:0,L:0,XL:0,XXL:0}; }

    // validation
    if(!data.name){ alert("Name is required"); return; }
    if(!data.description){ alert("Description required"); return; }

    // either add or update
    const all = await StorageEngine.getAll();
    if(all.some(p=>p.id === data.id)){
      await StorageEngine.update({...existing, ...data});
    } else {
      await StorageEngine.add(data);
    }

    await renderAdminList(productsContainer);
    alert("Saved");
  });

  // image manager openers defined below via openImageManager
}

/* open edit form modal (simple inline form fill) */
async function openEditModal(id){
  const all = await StorageEngine.getAll();
  const prod = all.find(p=>p.id===id);
  if(!prod) return alert("Product not found");
  const form = document.getElementById("productForm");
  fillFormWith(prod, form);
  // load image manager for this product
  const imageManagerArea = document.getElementById("imageManager");
  initImageManager(imageManagerArea, prod);
  // scroll to form
  form.scrollIntoView({behavior:'smooth',block:'center'});
}

/* open image manager directly (used from list) */
async function openImageManager(id){
  const all = await StorageEngine.getAll();
  const prod = all.find(p=>p.id===id);
  if(!prod) return alert("Not found");
  const imageManagerArea = document.getElementById("imageManager");
  initImageManager(imageManagerArea, prod);
  imageManagerArea.scrollIntoView({behavior:'smooth',block:'center'});
}

/* ---------- Store (store.html) functions ---------- */
async function bootstrapStore(container){
  const all = await StorageEngine.getAll();
  if(all.length === 0){
    container.innerHTML = `<div class="card center text-muted">No items available.</div>`;
    return;
  }
  container.innerHTML = "";
  const grid = document.createElement("div"); grid.className = "store-grid";
  all.forEach(prod=>{
    const row = document.createElement("div"); row.className="store-row";

    const thumb = document.createElement("div"); thumb.className="store-thumb";
    const img = document.createElement("img");
    img.src = (prod.images && prod.images.find(i=>i)) || '';
    img.alt = prod.name || '';
    if(prod.images && prod.images.some(i=>i)) thumb.appendChild(img);
    else thumb.innerHTML = `<div style="padding:20px;color:var(--muted)">No image</div>`;

    const info = document.createElement("div"); info.style.flex="1";
    const title = document.createElement("h3"); title.innerText = prod.name; title.style.margin="0 0 8px 0";
    const desc = document.createElement("p"); desc.className="text-muted"; desc.innerText = prod.description;
    const price = document.createElement("div"); price.className="price"; price.innerText = `$${Number(prod.price).toFixed(2)}`;

    // inventory line (for apparel)
    let invHtml = "";
    if(prod.type === "apparel"){
      invHtml = `<div style="margin-top:12px">
        <strong>Inventory:</strong>
        <span style="margin-left:8px" class="text-muted">S:${prod.sizes.S} M:${prod.sizes.M} L:${prod.sizes.L} XL:${prod.sizes.XL} XXL:${prod.sizes.XXL}</span>
      </div>`;
    }

    // thumbnails
    let thumbs = '';
    if(prod.images && prod.images.length){
      thumbs = `<div style="display:flex;gap:6px;margin-top:12px">` + prod.images.map(s=>{
        return s ? `<img src="${s}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #eef2f7">`
                  : `<div style="width:48px;height:48px;background:#f3f4f6;border-radius:6px;border:1px solid #eef2f7"></div>`;
      }).join('') + `</div>`;
    }

    info.appendChild(title);
    info.appendChild(desc);
    info.appendChild(price);
    info.innerHTML += invHtml;
    info.innerHTML += thumbs;

    row.appendChild(thumb);
    row.appendChild(info);
    grid.appendChild(row);
  });
  container.appendChild(grid);
}

/* ---------- page-specific bootstraps ---------- */

document.addEventListener("DOMContentLoaded", async ()=>{
  // If admin page (index.html) present: start admin
  const adminProducts = document.getElementById("adminProducts");
  if(adminProducts){
    await bootstrapAdmin();

    // initialize basic form
    const form = document.getElementById("productForm");
    // preset with empty product
    const empty = createEmptyProduct();
    fillFormWith(empty, form);
    form.querySelector("#prodId").value = empty.id;

    // delete product handler from UI
    document.getElementById("deleteProductBtn")?.addEventListener("click", async ()=>{
      const id = form.querySelector("#prodId").value;
      if(!id) return alert("No product selected");
      if(confirm("Delete this product permanently?")){
        await StorageEngine.delete(id);
        await renderAdminList(adminProducts);
        // clear form
        const newEmpty = createEmptyProduct();
        fillFormWith(newEmpty, form);
        initImageManager(document.getElementById("imageManager"), newEmpty);
      }
    });

    // new product button
    document.getElementById("newProductBtn")?.addEventListener("click", async ()=>{
      const p = createEmptyProduct();
      await StorageEngine.add(p);
      await renderAdminList(adminProducts);
      openEditModal(p.id);
    });

    // ensure image manager area shows the empty product
    initImageManager(document.getElementById("imageManager"), empty);
  }

  // If store page present
  const storeContainer = document.getElementById("storeContainer");
  if(storeContainer){
    await bootstrapStore(storeContainer);
  }
});
