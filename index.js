const express = require('express');
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 9069;


const db = mysql.createConnection({
    host: 'localhost',
    user: 'user',
    password: 'admin',
    database: 'user_notes'
});

db.connect((err) => {
    if (err) {
        console.error('error conectando a mysql ', err);
        return;
    }
    console.log('conectado a mysql');
});

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


// cors es necesario ya que durante las pruebas, el servidor esta corriendo en un dominio distinto
const corsOptions = {
    origin: [
        'https://aledotcv.com',
        'http://127.0.0.1:3000',
        'https://noochron.aledotcv.com'
    ],
    credentials: true
};

app.use(cors(corsOptions));

/*
Headers/Cabezeras:
x-session-id: Un set de caracteres que identifica al usuario durante una
sesión. Con la implementación actual, una sesión no expira hasta que se vuelva
a iniciar sesión con usuario y contraseña en el mismo u otro navegador.

x-user-id: El número que identifica al usuario dentro de la base de datos,
por default es ascendente según el orden de registro.

x-note-id: El número que identifica a una nota dentro de la base de datos,
el número es global y asciende segun que tantas notas han creado todos los 
usuarios.

type-search: El filtro de busqueda a utilizar (title, content, tags).
*/

// Función para autenticar al usuario mediante una sesión
// de esta forma el cliente no tiene que estar enviando la contraseña en cada request
function isAuthenticated(req, res, next) {
    const sessionId = req.headers['x-session-id'];
    const userId = req.headers['x-user-id'];
    const query = 'SELECT * FROM users WHERE sessionId = ? AND userId = ?';
    db.query(query, [sessionId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).send('Unauthorized');
        }
        req.user = results[0];
        next();
    });
}

// Endpoint de registro
app.post('/register', async (req, res) => {
    const { username, password, email, pin } = req.body;
        if (!email || !password || !username || !pin) {
            return res.status(400).send('Los campos no pueden estar vacios');
        }
        else if (username.length > 24) {
            return res.status(400).send('El nombre de usuario no puede ser mayor a 24 caracteres');
        }
        else if (email.length > 254 || password.length > 254) {
            return res.status(400).send('El email y la contraseña no pueden ser mayores a 254 caracteres');
        }
        // La funcionalidad que requería del PIN no se implemento por
        // un cambio de enfoque. El cliente envia 000000 por default
        // para satisfacer el requisito de registro.
        else if (pin.length !== 6) {
            return res.status(400).send('El pin debe ser de 6 digitos');
        }
        else{
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = 'INSERT INTO users (username, password, email, pin) VALUES (?, ?, ?, ?)';
    db.query(query, [username, hashedPassword, email, pin], (err, result) => {
        if (err) {
            console.error('error al registrar usuario', err);
            return res.status(500).send('error al registrar usuario');
        }
        res.status(201).send('usuario registrado');
    });
 }
});

// Endpoint de login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).send('usuario o contraseña invalidos');
        }

        const user = results[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).send('usuario o contraseña invalidos');
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Expose-Headers', 'x-session-id'); 
        // Para mayor seguridad, este valor debe ser aleatorio
        // (Date.now podría ser reemplazado o alterado para ayudar con esto)
                const sessionId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

        const updateQuery = 'UPDATE users SET sessionId = ? WHERE userId = ?';
        db.query(updateQuery, [sessionId, user.userId], (err, result) => {
            if (err) {
                console.error('error al actualizar sessionId', err);
                return res.status(500).send('error al actualizar sessionId');
            }

            res.setHeader('x-session-id', sessionId);
            res.status(200).send({ userId: user.userId, username: user.username, email: user.email });
        });
    });
});

// Endpoint de busqueda
app.post("/search", isAuthenticated, (req, res) => { 
    let sqlQuery = "content";
    let userId = req.headers['x-user-id'];
    let typeSearch = req.headers['type-search'];
    const { query } = req.body;
    if (!typeSearch && !query) {
        return res.status(400).json({ error: 'se requiere el filtro de busqueda' });
    }

    switch (typeSearch){
            case "tags" : sqlQuery = `
            SELECT * FROM notes
            WHERE tags LIKE ? AND userId = ?
            `; console.log("searching tags"); break;

            case "content": sqlQuery =`
            SELECT * FROM notes
            WHERE content LIKE ? AND userId = ?
            `;console.log("searching content"); break;

            case "title": sqlQuery =`
            SELECT * FROM notes
            WHERE title LIKE ? AND userId = ?
            `; console.log("searching title");break;
    }   

        const searchValue = `%${query}%`;
    db.query(sqlQuery, [searchValue, userId], (err, results) => {
            if (err) {
                console.error("error al ejecutar la busqueda:", err);
                return res.status(500).json({ error: "error interno del servidor" });
            }
            console.log(results);
            res.json(results);
        });
});

// Endpoint para crear una nota
app.post('/notes', isAuthenticated, (req, res) => {
    let userId = req.headers['x-user-id'];
    const { declaredId, tags, title, content } = req.body;
    checkMismatch(req.body.userId, userId);
    if (!title || !content) {
        return res.status(400).send('Se requiere un titulo y contenido');
    }
    if (title.length > 24) {
        return res.status(400).send('El titulo no puede ser mayor a 24 caracteres');
    }
    if (tags.length > 36) {
        return res.status(400).send('El total de etiquetas no puede ser mayor a 36 caracteres');
    }

    const query = 'INSERT INTO notes (userId, tags, title, content) VALUES (?, ?, ?, ?)';
    db.query(query, [userId, tags, title, content], (err, result) => {
        if (err) {
            console.error('error al crear la nota', err);
            return res.status(500).send('error al crear la nota');
        }
        console.log('nota creada');
        res.status(201).send('nota creada');
    });
});

// Esta función esta de mas y se agrego por cuestiones de control
function checkMismatch(declaredId, userId) {
    if (declaredId !== userId) {
        console.log('mismatch -- se declaro el ID: ' + declaredId + ' pero el ID autenticado es: ' + userId);
    }
}

// Endpoint que responde con todas las notas del usuario
app.get('/notes', isAuthenticated, (req, res) => {
    let userId = req.headers['x-user-id'];
    const query = 'SELECT * FROM notes WHERE userId = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.log('error al obtener notas', err);
            return res.status(500).send('Error al obtener notas');
        }
        console.log('fetched notes'); 
        res.status(200).json(results);
    });
});

// Endpoint que actualiza una nota del usuario
app.put('/notes/', isAuthenticated, (req, res) => {
    let userId = req.headers['x-user-id'];
    let noteId = req.headers['x-note-id'];
    const checkQuery = 'SELECT * FROM notes WHERE noteId = ? AND userId = ?';
    db.query(checkQuery, [noteId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Nota no encontrada');
        }
    });
    const { tags, title, content } = req.body;

    if (!title || !content) {
        return res.status(400).send('Se requiere un titulo y contenido');
    }
    if (title.length > 24) {
        return res.status(400).send('El titulo no puede ser mayor a 24 caracteres');
    }
    if (tags.length > 36) {
        return res.status(400).send('El total de etiquetas no puede ser mayor a 36 caracteres');
    }

    const query = 'UPDATE notes SET tags = ?, title = ?, content = ? WHERE noteId = ? AND userId = ?';
    db.query(query, [tags, title, content, noteId, userId], (err, result) => {
        if (err) {
            return res.status(500).send('error al actualizar nota');
        }
        res.status(200).send('nota actualizada');
    });
});

// Endpoint que borra una nota
app.delete('/notes/', isAuthenticated, (req, res) => {
    let userId = req.headers['x-user-id'];
    let noteId = req.headers['x-note-id'];

    const checkQuery = 'SELECT * FROM notes WHERE noteId = ? AND userId = ?';
    db.query(checkQuery, [noteId, userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Nota no encontrada');
        }

        const deleteQuery = 'DELETE FROM notes WHERE noteId = ? AND userId = ?';
        db.query(deleteQuery, [noteId, userId], (err, result) => {
            if (err) {
                return res.status(500).send('Error al eliminar nota');
            }
            res.status(200).send('Nota eliminada');
        });
    });
});

// Endpoint para consultar si el servidor es accesible
app.get('/', (req, res) => {
    res.send('abcdefgh');
});

app.listen(port, () => {
    console.log(`http://localhost:${port}`);
});
