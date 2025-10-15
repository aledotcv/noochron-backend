const bcrypt = require('bcrypt')


function login(req, res){
    if(req.session.loggedin != true){
        console.log("not logged in");
    res.render('../views/login/login.js');
    }
    else{
        res.redirect('/');
    }
}

function auth(req, res){
    const data = req.body;
    
    
    req.getConnection((err,conn) =>{
        conn.query('SELECT * FROM users WHERE email = ?', [data.email], (err, userdata) =>{
            

            if(userdata.length > 0){
                userdata.forEach(element => {
                bcrypt.compare(data.password, element.password, (err, isMatch) =>{
                    
                        if (!isMatch){
                            res.render('login/login.js', {error: 'Incorrect password!'})
                        } else {
                            
                            req.session.loggedin = true;
                            req.session.name = element.name;

                            res.redirect('/');

                        }
                    });
                });


            } else {
                res.render('login/login.js', { error: 'Error: user not exist!'});
            }
        });
    });
}

function register(req, res){
    if(req.session.loggedin != true){
        res.render('../views/login/register.js');
        }
        else{
            res.redirect('/');
        }
}

function storeUser(req, res){
    const data = req.body;

    req.getConnection((err,conn) =>{
        conn.query('SELECT * FROM users WHERE email = ?', [data.email], (err, userdata) =>{
            if(userdata.length > 0){
                res.render('login/register.js', { error: 'Error: user alredy exist!'});
            } else {

                bcrypt.hash(data.password, 12).then(hash =>{
        
                    data.password = hash;
                    req.getConnection((err,conn) =>{
                        conn.query('INSERT INTO users SET ?', [data], (err,rows) => {
                            req.session.loggedin = true;
                            req.session.name = data.name;

                            res.redirect('/');
                        });
                    });
                });

            }
        });
    });

    
}



function logout(req, res){
    if (req.session.loggedin == true) {

        req.session.destroy();
    }
    res.redirect('/login')
}


module.exports = {
    login: login,
    register: register,
    storeUser: storeUser,
    auth: auth,
    logout: logout,
}