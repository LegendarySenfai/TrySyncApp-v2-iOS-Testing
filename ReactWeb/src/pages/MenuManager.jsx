import React, { useState, useEffect } from 'react';
import api, { BASE_URL } from '../config/api';
import Sidebar from '../components/Sidebar';


export default function MenuManager() {
  const [rawInventory, setRawInventory] = useState([]);
  const [products, setProducts] = useState([]);
  
  // View and Search States
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [searchQuery, setSearchQuery] = useState('');

  // UI-ONLY PAGINATION STATES FOR THE TABLE
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
      setCurrentPage(1); 
  }, [searchQuery, viewMode]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState(null);
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('milktea');
  const [subCategory, setSubCategory] = useState('classic');
  const [basePrice, setBasePrice] = useState('');
  const [allowModifiers, setAllowModifiers] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [ingredients, setIngredients] = useState([
      { raw_inventory_id: '', input_quantity: '', input_unit: 'scoops' }
  ]);

  const [selectedFile, setSelectedFile] = useState(null); 
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type: 'success' }), 3000);
  };

  useEffect(() => {
  const refreshInterval = setInterval(() => {
    fetchData(); // Replace with your specific data-fetching function name
  }, 30000); 

  return () => clearInterval(refreshInterval);
}, []);
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
      try {
          const [rawRes, prodRes] = await Promise.all([
              api.get('/admin/raw_inventory'),
              api.get('/admin/products')
          ]);
          setRawInventory(rawRes.data);
          setProducts(prodRes.data);
      } catch (err) {
          console.error("Failed to fetch data");
      }
  };

  // --- FORM ACTIONS ---
  const handleEditClick = (product) => {
      setEditingId(product.id);
      setProductName(product.product_name);
      setCategory(product.category);
      setSubCategory(product.sub_category || 'classic');
      setBasePrice(product.base_price);
      setAllowModifiers(product.allow_modifiers === 1 || product.allow_modifiers === true);
      setIsActive(product.is_active === 1 || product.is_active === true);

      setExistingImageUrl(product.image_url || '');
      setSelectedFile(null);
      
      if (product.recipe && product.recipe.length > 0) {
          const mappedIngredients = product.recipe.map(ing => ({
              raw_inventory_id: ing.raw_inventory_id.toString(),
              input_quantity: ing.input_quantity.toString(),
              input_unit: ing.input_unit
          }));
          setIngredients(mappedIngredients);
      } else {
          setIngredients([]);
      }
      setIsModalOpen(true); 
  };

  const handleCancelEdit = () => {
      setEditingId(null);
      setProductName(''); setBasePrice(''); setAllowModifiers(true); setIsActive(true);
      setIngredients([{ raw_inventory_id: '', input_quantity: '', input_unit: 'scoops' }]);
      setSelectedFile(null);
      setExistingImageUrl('');
      setIsModalOpen(false); 
  };

  const handleCreateNewClick = () => {
      handleCancelEdit(); 
      setIsModalOpen(true); 
  };

  const handleAddIngredientRow = () => setIngredients([...ingredients, { raw_inventory_id: '', input_quantity: '', input_unit: 'scoops' }]);
  const handleIngredientChange = (index, field, value) => {
    const newIngredients = [...ingredients];
    newIngredients[index][field] = value;
    setIngredients(newIngredients);
  };
  const handleRemoveIngredient = (index) => setIngredients(ingredients.filter((_, i) => i !== index));

  // --- LIVE PROFIT CALCULATOR ---
  const calculateTotalCost = () => {
      let total = 0;
      ingredients.forEach(ing => {
          if (ing.raw_inventory_id && ing.input_quantity) {
              const rawItem = rawInventory.find(item => item.id.toString() === ing.raw_inventory_id.toString());
              if (rawItem) {
                  let amount = parseFloat(ing.input_quantity) || 0;
                  if (ing.input_unit === 'scoops') amount *= 15;
                  else if (ing.input_unit === 'pumps') amount *= 10;
                  total += amount * parseFloat(rawItem.cost_per_unit || 0);
              }
          }
      });
      return total;
  };

  const totalCost = calculateTotalCost();
  const sellingPrice = parseFloat(basePrice) || 0;
  const profit = sellingPrice - totalCost;
  const marginPercent = sellingPrice > 0 ? ((profit / sellingPrice) * 100).toFixed(1) : 0;

  // 🛠️ FIXED: Cleaned up the collision between FormData and the old payload
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // 🔒 Lock
    // Strict Negative Number Check
    if (parseFloat(basePrice) < 0) return showToast("Price cannot be negative.", "error");
    if (ingredients.some(ing => parseFloat(ing.input_quantity) <= 0)) return showToast("Ingredient quantities must be greater than zero.", "error");
    if (!productName || !basePrice || ingredients.some(ing => !ing.raw_inventory_id || !ing.input_quantity)) {
        return showToast("Please fill out all fields completely.", "error");
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('product_name', productName);
    formData.append('category', category);
    formData.append('sub_category', category === 'milktea' ? subCategory : ''); // 🛠️ NEW LINE
    formData.append('base_price', basePrice);
    formData.append('allow_modifiers', allowModifiers ? 1 : 0);
    formData.append('is_active', isActive ? 1 : 0);
    formData.append('ingredients', JSON.stringify(ingredients));
    
    if (selectedFile) {
        formData.append('image', selectedFile); 
    }

    try {
        const config = { headers: { 'Content-Type': 'multipart/form-data' } };
        if (editingId) {
            await api.put(`/admin/products/update/${editingId}`, formData, config);
            showToast("Product successfully updated!", "success"); 
        } else {
            await api.post('/admin/products/create', formData, config);
            showToast("New product published!", "success");
        }
        handleCancelEdit();
        fetchData();
    } catch (err) { 
        const backendError = err.response?.data?.message || err.response?.data?.error?.sqlMessage || err.message;
        showToast("Error saving product: " + backendError, "error");
        console.error(err);
    } finally {
        setIsSubmitting(false); // 🔓 Unlock
    }
  };

  // Filter products based on search query, THEN sort alphabetically (UI ONLY)
  const filteredProducts = products
      .filter(p => 
          p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => a.product_name.localeCompare(b.product_name));

  // PAGINATION MATH (UI ONLY)
  const itemsPerPage = viewMode === 'grid' ? 15 : 5;
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F2F5' }}>
      <Sidebar />

      <div style={{ flex: 1, padding: '24px 32px', marginLeft: 260, boxSizing: 'border-box', maxWidth: 'calc(100% - 260px)' }}>
          
          {/* HEADER SECTION */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                  <h2 style={{ margin: '0 0 5px 0', color: '#0f172a' }}>📋 Active Menu</h2>
                  <p style={{ color: '#64748b', margin: 0 }}>Select an item to edit its recipe and pricing.</p>
              </div>
              <button onClick={handleCreateNewClick} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)' }}>
                  Create New Item
              </button>
          </div>

          {/* SEARCH & VIEW TOGGLE CONTROLS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '15px', background: '#fff', padding: '12px 20px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
              
              <input 
                  type="text" 
                  placeholder="Search items by name or category..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '12px 20px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', background: '#fff', color: '#334155', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}
              />
              
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '4px', border: '1px solid #e2e8f0' }}>
                  <button 
                      onClick={() => setViewMode('grid')}
                      style={{ outline: 'none', background: viewMode === 'grid' ? '#fff' : 'transparent', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: viewMode === 'grid' ? '#3b82f6' : '#64748b', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: '0.2s' }}
                  >
                      Grid
                  </button>
                  <button 
                      onClick={() => setViewMode('list')}
                      style={{ outline: 'none', background: viewMode === 'list' ? '#fff' : 'transparent', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: viewMode === 'list' ? '#3b82f6' : '#64748b', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: '0.2s' }}
                  >
                      List
                  </button>
              </div>
          </div>
          
          {/* MENU GRID/LIST RENDER */}
          {viewMode === 'grid' ? (
              
              /* ── GRID VIEW (3 Columns) ── */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                  {currentItems.map(p => (
                      <div key={p.id} style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                          <div>
                              <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '14px' }}>{p.product_name}</div>
                              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                                  <span style={{ fontWeight: 'bold', color: '#10b981' }}>₱{p.base_price}</span> • {p.category.toUpperCase()}
                              </div>
                          </div>
                          <button onClick={() => handleEditClick(p)} style={{ background: '#4779c8', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer' }}>
                              Edit
                          </button>
                      </div>
                  ))}
              </div>

          ) : (

              /* ── LIST VIEW (Seamless Table) ── */
              <div style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                          {currentItems.map((p, index) => (
                              <tr key={p.id} style={{ borderBottom: index === currentItems.length - 1 ? 'none' : '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                                  
                                  {/* Category Badge */}
                                  <td style={{ padding: '15px 20px', width: '100px', verticalAlign: 'middle' }}>
                                      <span style={{ background: p.category === 'milktea' ? '#e0f2fe' : '#f3e8ff', color: p.category === 'milktea' ? '#0284c7' : '#7e22ce', padding: '5px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                          {p.category}
                                      </span>
                                  </td>

                                  {/* Product Name */}
                                  <td style={{ padding: '15px 20px', verticalAlign: 'middle', fontWeight: 'bold', color: '#1e293b', fontSize: '15px' }}>
                                      {p.product_name}
                                  </td>

                                  {/* Price */}
                                  <td style={{ padding: '15px 20px', verticalAlign: 'middle', width: '120px' }}>
                                      <span style={{ fontWeight: 'bold', color: '#10b981', fontSize: '15px' }}>₱{parseFloat(p.base_price).toFixed(2)}</span>
                                  </td>

                                  {/* Action Button */}
                                  <td style={{ padding: '15px 20px', verticalAlign: 'middle', textAlign: 'right', width: '100px' }}>
                                      <button onClick={() => handleEditClick(p)} style={{ background: '#4779c8', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                          Edit
                                      </button>
                                  </td>
                                  
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          )}

          {/* Fallback for Empty Search (Works for both views) */}
          {filteredProducts.length === 0 && (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '10px', border: '1px dashed #cbd5e1', marginTop: '15px' }}>
                  No items found matching "{searchQuery}"
              </div>
          )}
          
          {/* NEW UI: PAGINATION CONTROLS */}
          {totalPages > 1 && (
              <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  marginTop: '15px', 
                  padding: '20px', 
                  background: '#ffffff', 
                  borderRadius: '10px', 
                  boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
                  border: '1px solid #e2e8f0',
                  width: '100%',
                  boxSizing: 'border-box'
              }}>
              
              <span style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
                  Showing {currentItems.length} of {filteredProducts.length} items
              </span>
              
              {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                      {/* First Page (<<) */}
                      <button 
                          onClick={() => setCurrentPage(1)} 
                          disabled={currentPage === 1}
                          style={{ background: currentPage === 1 ? '#f1f5f9' : '#1e293b', color: currentPage === 1 ? '#94a3b8' : 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: currentPage === 1 ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '16px', transition: '0.2s' }}
                      >
                          «
                      </button>

                      {/* Previous Page (<) */}
                      <button 
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                          disabled={currentPage === 1}
                          style={{ background: currentPage === 1 ? '#f1f5f9' : '#1e293b', color: currentPage === 1 ? '#94a3b8' : 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: currentPage === 1 ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '16px', transition: '0.2s' }}
                      >
                          ‹
                      </button>
                      
                      <span style={{ fontSize: '14px', color: '#334155', fontWeight: '600', padding: '0 12px' }}>
                          Page {currentPage} of {totalPages}
                      </span>
                      
                      {/* Next Page (>) */}
                      <button 
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                          disabled={currentPage === totalPages}
                          style={{ background: currentPage === totalPages ? '#f1f5f9' : '#1e293b', color: currentPage === totalPages ? '#94a3b8' : 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: currentPage === totalPages ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '16px', transition: '0.2s' }}
                      >
                          ›
                      </button>

                      {/* Last Page (>>) */}
                      <button 
                          onClick={() => setCurrentPage(totalPages)} 
                          disabled={currentPage === totalPages}
                          style={{ background: currentPage === totalPages ? '#f1f5f9' : '#1e293b', color: currentPage === totalPages ? '#94a3b8' : 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: currentPage === totalPages ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '16px', transition: '0.2s' }}
                      >
                          »
                      </button>
                  </div>
              )}
          </div>
          )}

          {/* THE MODAL POPUP */}
          {isModalOpen && (
              <div style={modalOverlay}>
                  <div style={modalContent}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                          <h2 style={{ margin: 0, color: '#0f172a' }}>
                              {editingId ? '✏️ Edit Menu Item' : '✨ Create New Item'}
                          </h2>
                          <button onClick={handleCancelEdit} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>❌</button>
                      </div>

                      <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                            <div style={{ flex: 2 }}>
                                <label style={labelStyle}>Product Name</label>
                                <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Taro Milk Tea" style={inputStyle} required />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Category</label>
                                <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                                    <option value="milktea">Milk Tea</option>
                                    <option value="laundry">Laundry</option>
                                </select>
                            </div>
                            {/* 🛠️ NEW: DYNAMIC SUB-CATEGORY DROPDOWN */}
                                {category === 'milktea' && (
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Drink Type</label>
                                        <select value={subCategory} onChange={e => setSubCategory(e.target.value)} style={inputStyle}>
                                            <option value="classic">Classic</option>
                                            <option value="frappe">Frappe / Ice Blend</option>
                                            <option value="cheesecake">Cheesecake Series</option>
                                            <option value="fruit_tea">Fruit Tea</option>
                                        </select>
                                    </div>
                                )}
                            <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Price</label>
                                <input type="number" step="0.01" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)} style={inputStyle} required />
                            </div>
                        </div>

                        {/* Image Assignment */}
                        <div style={{ marginBottom: '25px' }}>
                            <label style={labelStyle}>Set Product Image</label>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '5px' }}>
                                <input 
                                    type="file" 
                                    accept="image/*"
                                    onChange={(e) => setSelectedFile(e.target.files[0])}
                                    style={{ ...inputStyle, flex: 1, padding: '8px', cursor: 'pointer' }}
                                />
                                {/* Live Image Preview Box */}
                                <div style={{ width: 60, height: 60, borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f8fafc', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                        {selectedFile ? (
                                                <img 
                                                    src={URL.createObjectURL(selectedFile)} 
                                                    alt="preview" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 5 }} 
                                                />
                                            ) : existingImageUrl ? (
                                                <img 
                                                    src={`${BASE_URL}/uploads/${existingImageUrl}`} 
                                                    alt="product" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 5 }} 
                                                />
                                            ) : (
                                                <span style={{ fontSize: 10, color: '#94a3b8' }}>No Image</span>
                                            )}
                                </div>
                            </div>
                            
                            {/* Helper Text below file picker */}
                            {existingImageUrl && !selectedFile && (
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                    Current File: <strong>{existingImageUrl}</strong>
                                </div>
                            )}
                            {selectedFile && (
                                <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>
                                    New File Selected: <strong>{selectedFile.name}</strong>
                                </div>
                            )}
                        </div>

                        {/* LIVE PROFIT DASHBOARD */}
                        <div style={{ display: 'flex', gap: '15px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '25px' }}>
                            <div style={{ flex: 1 }}>
                                <div style={statLabelStyle}>Ingredient Cost</div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#e74c3c' }}>₱{totalCost.toFixed(2)}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={statLabelStyle}>Estimated Profit</div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: profit > 0 ? '#27ae60' : '#e74c3c' }}>₱{profit.toFixed(2)}</div>
                            </div>
                            <div style={{ flex: 1, borderLeft: '2px solid #e2e8f0', paddingLeft: '15px' }}>
                                <div style={statLabelStyle}>Profit Margin</div>
                                <div style={{ fontSize: '24px', fontWeight: '900', color: marginPercent > 50 ? '#27ae60' : (marginPercent > 0 ? '#f39c12' : '#e74c3c') }}>{marginPercent}%</div>
                            </div>
                        </div>

                        <h4 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px', color: '#334155' }}>Recipe Matrix</h4>
                        
                        {ingredients.map((ing, index) => (
                            <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
                                <select value={ing.raw_inventory_id} onChange={e => handleIngredientChange(index, 'raw_inventory_id', e.target.value)} style={{ ...inputStyle, flex: 2 }} required>
                                    <option value="">-- Select Ingredient --</option>
                                    {rawInventory.filter(item => item.category === category).map(item => (
                                        <option key={item.id} value={item.id}>{item.item_name}</option>
                                    ))}
                                </select>
                                <input type="number" step="0.1" min="0" placeholder="Qty" value={ing.input_quantity} onChange={e => handleIngredientChange(index, 'input_quantity', e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
                                <select value={ing.input_unit} onChange={e => handleIngredientChange(index, 'input_unit', e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                                    <option value="scoops">Scoops (15g)</option>
                                    <option value="pumps">Pumps (10ml)</option>
                                    <option value="sachets">Sachets/Pcs</option>
                                    <option value="ml">ml</option>
                                    <option value="g">grams</option>
                                </select>
                                <button type="button" onClick={() => handleRemoveIngredient(index)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', marginTop: '5px' }}>X</button>
                            </div>
                        ))}

                        <button type="button" onClick={handleAddIngredientRow} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', marginBottom: '20px', fontWeight: 'bold' }}>+ Add Ingredient</button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input type="checkbox" checked={allowModifiers} onChange={(e) => setAllowModifiers(e.target.checked)} style={{ width: '20px', height: '20px' }}/>
                                <label style={{ fontWeight: 'bold', color: '#334155' }}>Allow Add-ons</label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: '20px', height: '20px' }}/>
                                <label style={{ fontWeight: 'bold', color: '#334155' }}>Visible on POS</label>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button type="submit" disabled={isSubmitting} style={{ flex: 1, background: editingId ? '#3b82f6' : '#27ae60', opacity: isSubmitting ? 0.7 : 1, color: '#fff', border: 'none', padding: '15px', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                                {editingId ? 'UPDATE PRODUCT' : 'SAVE & PUBLISH PRODUCT'}
                            </button>
                            <button type="button" onClick={handleCancelEdit} style={{ flex: 1, background: '#94a3b8', color: '#fff', border: 'none', padding: '15px', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                                CANCEL
                            </button>
                        </div>
                      </form>
                  </div>
              </div>
              
          )}

          {toast.visible && (
            <div style={{
              position: 'fixed',
              top: '40px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: toast.type === 'success' ? '#10b981' : '#ef4444',
              color: 'white',
              padding: '14px 24px',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              fontWeight: 'bold',
              fontSize: '14px',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <span>{toast.type === 'success'}</span>
              {toast.message}
            </div>
          )}
     
      </div>
    </div>
  );
}

// STYLES
const inputStyle = { 
  width: '100%', 
  padding: '10px', 
  border: '1px solid #cbd5e1', 
  borderRadius: '5px', 
  boxSizing: 'border-box', 
  marginTop: '5px', 
  backgroundColor: '#ffffff', 
  color: '#0f172a',           
  fontSize: '14px'
};
const labelStyle = { display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold' };
const statLabelStyle = { fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '5px' };

// MODAL STYLES
const modalOverlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' };
const modalContent = { backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '700px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' };