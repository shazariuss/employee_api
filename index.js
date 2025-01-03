const express = require('express');
const cors = require('cors');
const pool = require('./database');
const authRoutes = require('./auth');

const app = express();


app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes);


// Create employee
app.post('/employees', async (req, res) => {
  try {
    const client = await pool.connect();
    
    await client.query('BEGIN');
    
    // Insert employee basic info
    const employeeResult = await client.query(
      `INSERT INTO employees (
        full_name, dob, gender, nationality, passport_number, 
        phone_number, email, country, city, postal_code, 
        street_address, position_id, department_id, 
        employment_date, employment_type_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
      RETURNING id`,
      [req.body.full_name, req.body.dob, req.body.gender, req.body.nationality,
       req.body.passport_number, req.body.phone_number, req.body.email,
       req.body.country, req.body.city, req.body.postal_code,
       req.body.street_address, req.body.position_id, req.body.department_id,
       req.body.employment_date, req.body.employment_type_id]
    );

    const employeeId = employeeResult.rows[0].id;

    // Insert education
    await client.query(
      `INSERT INTO education_history (employee_id, degree, university, graduation_year)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, req.body.degree, req.body.university, req.body.graduation_year]
    );

    // Insert work experience
    await client.query(
      `INSERT INTO work_experience (employee_id, company_name, job_title, years_of_experience)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, req.body.prev_company, req.body.job_title, req.body.experience_years]
    );

    // Insert emergency contact
    await client.query(
      `INSERT INTO emergency_contacts (employee_id, contact_name, relationship, phone_number)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, req.body.emergency_contact_name, 
       req.body.emergency_contact_relationship, 
       req.body.emergency_contact_number]
    );

    await client.query('COMMIT');
    client.release();

    res.json({ success: true, employeeId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// Search employees
app.get('/employees/search', async (req, res) => {
  try {
    const { field, value } = req.query;
    
    let query = `
      SELECT DISTINCT e.*,
        p.name as position_name,
        d.name as department_name,
        et.name as employment_type_name,
        eh.university,
        eh.degree,
        eh.graduation_year,
        we.company_name as previous_company,
        we.job_title as previous_position,
        we.years_of_experience,
        CASE 
          WHEN e.full_name ILIKE $2 THEN 0 
          ELSE 1 
        END as name_rank
      FROM employees e
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      LEFT JOIN education_history eh ON e.id = eh.employee_id
      LEFT JOIN work_experience we ON e.id = we.employee_id
      WHERE `;

    let searchValue;
    let queryParams = [];

    // Add WHERE clause based on search field
    switch (field) {
      case 'full_name':
      query += `(
        e.full_name ILIKE $1 OR 
        LOWER(e.full_name) LIKE LOWER($1) OR
        REPLACE(LOWER(e.full_name), ' ', '') LIKE LOWER(REPLACE($1, ' ', ''))
      )`;
      queryParams.push(`%${value}%`);
      break;

    case 'email':
      query += `LOWER(e.email) LIKE LOWER($1)`;
      queryParams.push(`%${value}%`);
      break;

    case 'phone_number':
      // Remove spaces and special characters from phone number
      searchValue = value.replace(/[\s\-\(\)\+]/g, '');
      query += `REPLACE(REPLACE(REPLACE(REPLACE(e.phone_number, ' ', ''), '-', ''), '(', ''), ')', '') LIKE $1`;
      queryParams.push(`%${searchValue}%`);
      break;

    case 'passport_number':
      // Remove spaces from passport number
      searchValue = value.replace(/\s/g, '');
      query += `REPLACE(e.passport_number, ' ', '') LIKE $1`;
      queryParams.push(`%${searchValue}%`);
      break;

    // Location-based search
    case 'city':
      query += `(
        LOWER(e.city) LIKE LOWER($1) OR
        LOWER(REPLACE(e.city, ' ', '')) LIKE LOWER(REPLACE($1, ' ', ''))
      )`;
      queryParams.push(`%${value}%`);
      break;

    case 'country':
      query += `(
        LOWER(e.country) LIKE LOWER($1) OR
        LOWER(REPLACE(e.country, ' ', '')) LIKE LOWER(REPLACE($1, ' ', ''))
      )`;
      queryParams.push(`%${value}%`);
      break;
      
      case 'nationality':
        query += `LOWER(e.nationality) LIKE LOWER($1)`;
        queryParams.push(`%${value}%`);
        break;

        case 'gender':
          query += `LOWER(e.gender) LIKE LOWER($1)`;
          queryParams.push(`%${value}%`);
          break;
  
        // Education-related search
        case 'university':
          query += `(
            LOWER(eh.university) LIKE LOWER($1) OR
            LOWER(REPLACE(eh.university, ' ', '')) LIKE LOWER(REPLACE($1, ' ', ''))
          )`;
          queryParams.push(`%${value}%`);
          break;
  
        case 'degree':
          query += `LOWER(eh.degree) LIKE LOWER($1)`;
          queryParams.push(`%${value}%`);
          break;
  
        case 'graduation_year':
          query += `CAST(eh.graduation_year AS TEXT) LIKE $1`;
          queryParams.push(`%${value}%`);
          break;
  
        // Work experience search
        case 'company_name':
          query += `(
            LOWER(we.company_name) LIKE LOWER($1) OR
            LOWER(REPLACE(we.company_name, ' ', '')) LIKE LOWER(REPLACE($1, ' ', ''))
          )`;
          queryParams.push(`%${value}%`);
          break;
  
        case 'job_title':
          query += `LOWER(we.job_title) LIKE LOWER($1)`;
          queryParams.push(`%${value}%`);
          break;
  
        case 'department':
          query += `LOWER(d.name) LIKE LOWER($1)`;
          queryParams.push(`%${value}%`);
          break;
  
        case 'position':
          query += `LOWER(p.name) LIKE LOWER($1)`;
          queryParams.push(`%${value}%`);
          break;
      
      default:
        query += `(
          e.full_name ILIKE $1 OR
          e.email ILIKE $1 OR
          e.phone_number ILIKE $1 OR
          e.passport_number ILIKE $1 OR
          e.nationality ILIKE $1 OR
          e.city ILIKE $1 OR
          e.country ILIKE $1 OR
          eh.university ILIKE $1 OR
          eh.degree ILIKE $1 OR
          we.company_name ILIKE $1 OR
          d.name ILIKE $1 OR
          p.name ILIKE $1
        )`;
        queryParams.push(`%${value}%`);
    }

    // Add ordering using the computed name_rank column
    query += `
      ORDER BY 
        name_rank,
        e.full_name ASC
    `;
    
    // Add the value parameter for the name_rank calculation
    queryParams.push(`%${value}%`);

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get employee details
app.get('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get basic info
    const employeeResult = await pool.query(
      `SELECT e.*, 
              p.name as position_name,
              d.name as department_name,
              et.name as employment_type_name
       FROM employees e
       LEFT JOIN positions p ON e.position_id = p.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN employment_types et ON e.employment_type_id = et.id
       WHERE e.id = $1`,
      [id]
    );

    // Get education
    const educationResult = await pool.query(
      'SELECT * FROM education_history WHERE employee_id = $1',
      [id]
    );

    // Get work experience
    const experienceResult = await pool.query(
      'SELECT * FROM work_experience WHERE employee_id = $1',
      [id]
    );

    // Get emergency contacts
    const contactsResult = await pool.query(
      'SELECT * FROM emergency_contacts WHERE employee_id = $1',
      [id]
    );

    res.json({
      ...employeeResult.rows[0],
      education: educationResult.rows[0],
      experience: experienceResult.rows[0],
      emergency_contact: contactsResult.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update employee
app.put('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      full_name, dob, gender, nationality, passport_number, 
      phone_number, email, country, city, postal_code, 
      street_address, position_id, department_id, 
      employment_date, employment_type_id,
      degree, university, graduation_year,
      prev_company, job_title, experience_years,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_number
    } = req.body;

    const client = await pool.connect();
    
    await client.query('BEGIN');

    // Update basic info
    await client.query(
      `UPDATE employees SET
        full_name = $1, dob = $2, gender = $3, nationality = $4,
        passport_number = $5, phone_number = $6, email = $7,
        country = $8, city = $9, postal_code = $10,
        street_address = $11, position_id = $12, department_id = $13,
        employment_date = $14, employment_type_id = $15,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $16`,
      [full_name, dob, gender, nationality, passport_number, 
       phone_number, email, country, city, postal_code, 
       street_address, position_id, department_id, 
       employment_date, employment_type_id, id]
    );

    // Update education
    await client.query(
      `UPDATE education_history SET
        degree = $1, university = $2, graduation_year = $3
       WHERE employee_id = $4`,
      [degree, university, graduation_year, id]
    );

    // Update work experience
    await client.query(
      `UPDATE work_experience SET
        company_name = $1, job_title = $2, years_of_experience = $3
       WHERE employee_id = $4`,
      [prev_company, job_title, experience_years, id]
    );

    // Update emergency contact
    await client.query(
      `UPDATE emergency_contacts SET
        contact_name = $1, relationship = $2, phone_number = $3
       WHERE employee_id = $4`,
      [emergency_contact_name, emergency_contact_relationship, emergency_contact_number, id]
    );

    await client.query('COMMIT');
    client.release();

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get reference data
app.get('/reference-data', async (req, res) => {
  try {
    const departments = await pool.query('SELECT * FROM departments');
    const positions = await pool.query('SELECT * FROM positions');
    const employmentTypes = await pool.query('SELECT * FROM employment_types');

    res.json({
      departments: departments.rows,
      positions: positions.rows,
      employmentTypes: employmentTypes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete employee
app.delete('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    
    await client.query('BEGIN');
    
    // Delete related records first
    await client.query('DELETE FROM education_history WHERE employee_id = $1', [id]);
    await client.query('DELETE FROM work_experience WHERE employee_id = $1', [id]);
    await client.query('DELETE FROM emergency_contacts WHERE employee_id = $1', [id]);
    
    // Delete employee record
    await client.query('DELETE FROM employees WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    client.release();
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
}).on('error', (err) => {
  console.error('Server error:', err);
});

module.exports = app;