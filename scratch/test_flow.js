const http = require('http');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Admin API integration tests...');

  try {
    // 1. Login
    console.log('\n🔑 1. Logging in as admin...');
    const loginRes = await request('http://localhost:3000/api/v1/admin/auth/login', {
      method: 'POST'
    }, {
      email: 'admin@kalyra.com',
      password: 'Admin@1234'
    });

    if (loginRes.statusCode !== 200 || !loginRes.body.success) {
      throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
    }
    const token = loginRes.body.data.accessToken;
    console.log('✅ Logged in successfully. Token received.');

    // 2. Fetch products and check product_type
    console.log('\n📦 2. Fetching products...');
    const productsRes = await request('http://localhost:3000/api/v1/products');
    if (productsRes.statusCode !== 200) {
      throw new Error(`Failed to fetch products: ${JSON.stringify(productsRes.body)}`);
    }
    const products = productsRes.body.data;
    console.log(`✅ Fetched ${products.length} products.`);
    const sample = products[0];
    console.log(`   Sample product: id=${sample.id}, name="${sample.name}", product_type="${sample.product_type}"`);
    if (!sample.product_type) {
      throw new Error('product_type field missing in API response!');
    }

    // 3. Filter by product_type
    console.log('\n🔍 3. Testing product_type filtering...');
    const apparelRes = await request('http://localhost:3000/api/v1/products?product_type=apparel');
    const shopRes = await request('http://localhost:3000/api/v1/products?product_type=shop');
    console.log(`   Apparel products count: ${apparelRes.body.data.length}`);
    console.log(`   Shop products count: ${shopRes.body.data.length}`);
    const hasInvalidApparel = apparelRes.body.data.some(p => p.product_type !== 'apparel');
    const hasInvalidShop = shopRes.body.data.some(p => p.product_type !== 'shop');
    if (hasInvalidApparel || hasInvalidShop) {
      throw new Error('Filtering by product_type returned incorrect type!');
    }
    console.log('✅ Product type filtering works perfectly.');

    // 4. Create a product with type 'apparel'
    console.log('\n➕ 4. Creating a new product with type "apparel"...');
    // Note: admin product POST uses multipart/form-data for image uploads.
    // For this test, we send raw json/urlencoded if supported, or since we changed body destructuring,
    // the route middleware handles urlencoded/json if multer doesn't find file. Let's try sending JSON.
    const createRes = await request('http://localhost:3000/api/v1/admin/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }, {
      name: 'Test Integration Dress',
      sku: 'KLY-AP-INTTEST',
      category: 'Wearable',
      product_type: 'apparel',
      price: 1899,
      discount_pct: 10,
      stock: 35,
      description: 'Test product created by integration script'
    });

    if (createRes.statusCode !== 201 || !createRes.body.success) {
      throw new Error(`Create product failed: ${JSON.stringify(createRes.body)}`);
    }
    const createdProduct = createRes.body.data;
    console.log(`✅ Product created: id=${createdProduct.id}, name="${createdProduct.name}", type="${createdProduct.product_type}"`);
    if (createdProduct.product_type !== 'apparel') {
      throw new Error(`Expected product_type "apparel", got "${createdProduct.product_type}"`);
    }

    // 5. Update the product to type 'shop'
    console.log('\n🔄 5. Updating the product to type "shop"...');
    const updateRes = await request(`http://localhost:3000/api/v1/admin/products/${createdProduct.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    }, {
      name: 'Test Integration Dress Updated',
      product_type: 'shop',
      price: 1799
    });

    if (updateRes.statusCode !== 200 || !updateRes.body.success) {
      throw new Error(`Update product failed: ${JSON.stringify(updateRes.body)}`);
    }
    const updatedProduct = updateRes.body.data;
    console.log(`✅ Product updated: id=${updatedProduct.id}, name="${updatedProduct.name}", type="${updatedProduct.product_type}"`);
    if (updatedProduct.product_type !== 'shop') {
      throw new Error(`Expected product_type "shop", got "${updatedProduct.product_type}"`);
    }

    // 6. Delete the product
    console.log('\n❌ 6. Deleting the created product...');
    const deleteRes = await request(`http://localhost:3000/api/v1/admin/products/${createdProduct.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (deleteRes.statusCode !== 200 || !deleteRes.body.success) {
      throw new Error(`Delete product failed: ${JSON.stringify(deleteRes.body)}`);
    }
    console.log('✅ Product deleted successfully.');

    // 7. Verify deletion
    console.log('\n🔍 7. Verifying deletion...');
    const checkRes = await request(`http://localhost:3000/api/v1/products`);
    const found = checkRes.body.data.some(p => p.id === createdProduct.id);
    if (found) {
      throw new Error('Product still exists in active products list after deletion!');
    }
    console.log('✅ Product successfully verified as deleted.');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Integration flow is 100% correct.');
  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
