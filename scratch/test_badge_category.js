const http = require('http');

const adminEmail = 'admin@kalyra.com';
const adminPassword = 'Admin@1234';

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };
        const reqBody = body ? JSON.stringify(body) : null;
        if (reqBody) {
            reqHeaders['Content-Length'] = Buffer.byteLength(reqBody);
        }

        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: `/api/v1${path}`,
            method: method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, text: data });
                }
            });
        });

        req.on('error', reject);
        if (reqBody) {
            req.write(reqBody);
        }
        req.end();
    });
}

async function runTest() {
    console.log('1. Logging in as admin...');
    const loginRes = await request('POST', '/admin/auth/login', {
        email: adminEmail,
        password: adminPassword
    });

    if (loginRes.status !== 200 || !loginRes.body.success) {
        console.error('Admin login failed!', loginRes);
        process.exit(1);
    }
    const token = loginRes.body.data.accessToken;
    console.log('Login successful. Token acquired.');

    const authHeaders = { 'Authorization': `Bearer ${token}` };

    console.log('\n2. Fetching categories...');
    const catRes = await request('GET', '/products/categories');
    console.log('Categories status:', catRes.status);
    console.log('Categories data:', catRes.body);

    console.log('\n3. Creating a test product with a badge...');
    const testProduct = {
        name: 'Test Badge Product',
        sku: `TST-${Date.now()}`,
        category: 'artistry',
        product_type: 'shop',
        price: 999,
        discount_pct: 0,
        stock: 10,
        description: 'A test product to verify badge persistence',
        badge: 'Best Seller'
    };

    // Note: the backend route POST /admin/products handles JSON or multipart-form-data. Let's send JSON.
    const createRes = await request('POST', '/admin/products', testProduct, authHeaders);
    if (createRes.status !== 201 && createRes.status !== 200) {
        console.error('Failed to create product:', createRes);
        process.exit(1);
    }
    const createdProduct = createRes.body.data;
    console.log('Product created successfully:', createdProduct);

    console.log('\n4. Retrieving created product to verify badge...');
    const getRes = await request('GET', `/products/${createdProduct.id}`);
    console.log('Product retrieved status:', getRes.status);
    console.log('Badge retrieved:', getRes.body.data.badge);

    if (getRes.body.data.badge !== 'Best Seller') {
        console.error('Assertion failed: badge is not Best Seller!');
        process.exit(1);
    }
    console.log('Badge assertion passed!');

    console.log('\n5. Updating product badge to Editor\'s Pick...');
    const updateRes = await request('PUT', `/admin/products/${createdProduct.id}`, {
        ...testProduct,
        badge: "Editor's Pick"
    }, authHeaders);
    console.log('Product update status:', updateRes.status);

    console.log('\n6. Retrieving updated product to verify badge...');
    const getRes2 = await request('GET', `/products/${createdProduct.id}`);
    console.log('Product retrieved status:', getRes2.status);
    console.log('Badge retrieved:', getRes2.body.data.badge);

    if (getRes2.body.data.badge !== "Editor's Pick") {
        console.error('Assertion failed: badge is not Editor\'s Pick!');
        process.exit(1);
    }
    console.log('Updated badge assertion passed!');

    console.log('\n7. Cleaning up test product...');
    const deleteRes = await request('DELETE', `/admin/products/${createdProduct.id}`, null, authHeaders);
    console.log('Delete status:', deleteRes.status);
    console.log('Test completed successfully!');
}

runTest().catch(console.error);
